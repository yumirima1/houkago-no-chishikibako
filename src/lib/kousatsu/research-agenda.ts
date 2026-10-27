import {createHash,randomInt} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {meaningfulTerms} from './relevance';
import type {ResearchSource} from './runtime-types';
import type {AnalysisResult,StoredItem} from './types';
import {interestDelta,type InterestAssessment} from './interest-evaluation';

const day=86400000,hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
export type AgendaSettings={initialScores:Record<string,number>;decayDays:number;decayPoints:number;discoveryBoost:number;maxSources:number;maxTopics:number;maxInquiryAttempts:number;freshDays:number};
export const agendaDefaults:AgendaSettings={initialScores:{},decayDays:7,decayPoints:5,discoveryBoost:6,maxSources:4,maxTopics:50,maxInquiryAttempts:3,freshDays:90};
export function parseAgendaSettings(value:unknown):AgendaSettings {
  if(value===undefined)return structuredClone(agendaDefaults);
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('AGENDA_CONFIG_INVALID');
  const v=value as Record<string,unknown>,result={...agendaDefaults,initialScores:{}} as AgendaSettings;
  for(const [key,min,max] of [['decayDays',1,90],['decayPoints',1,100],['discoveryBoost',1,30],['maxSources',1,7],['maxTopics',1,200],['maxInquiryAttempts',1,3],['freshDays',1,365]] as const){
    const n=v[key]??result[key];if(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max)throw Error(`AGENDA_CONFIG_INVALID: ${key}`);result[key]=n;
  }
  const initial=v.initialScores??{};if(typeof initial!=='object'||initial===null||Array.isArray(initial))throw Error('AGENDA_CONFIG_INVALID: initialScores');
  for(const [key,score] of Object.entries(initial)){
    if(!/^[\p{L}\p{N}_ -]{1,80}$/u.test(key)||typeof score!=='number'||!Number.isFinite(score)||score<0||score>100)throw Error('AGENDA_CONFIG_INVALID: score');result.initialScores[key]=score;
  }return result;
}
type Interest={key:string;kind:string;label:string;score:number;observations:number;last_seen_at:string|null;decay_at:string};
export type Inquiry={id:string;origin_job:string;question:string;genre:string;terms:string[];references:string[];priority:number;attempts:number;status:string;created_at:string;updated_at:string};
export type SourceBudget={id:string;score:number;candidateLimit:number;bodyLimit:number;reason:string};
export type SlotResearchPlan={createdAt:string;draw:number;explorationSource:string|null;sources:SourceBudget[];inquiryIds:string[]};

/** Additive, bounded planning state. Source documents, notes and past decisions
 * remain immutable. Each score change and inquiry attempt has a durable receipt. */
export class ResearchAgenda {
  readonly db:DatabaseSync;
  constructor(file:string,readonly settings:AgendaSettings=agendaDefaults,options:{readOnly?:boolean}={}){
    this.db=new DatabaseSync(file,{readOnly:options.readOnly??false});this.db.exec('PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON');
    if(options.readOnly)return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS research_interests(key TEXT PRIMARY KEY,kind TEXT NOT NULL,label TEXT NOT NULL,score REAL NOT NULL CHECK(score BETWEEN 0 AND 100),observations INTEGER NOT NULL,last_seen_at TEXT,decay_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_interest_events(id TEXT PRIMARY KEY,interest_key TEXT NOT NULL,job_id TEXT,previous_score REAL NOT NULL,score REAL NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_interest_observations(version_id TEXT PRIMARY KEY,job_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_agenda_ingested(job_id TEXT PRIMARY KEY,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_inquiries(id TEXT PRIMARY KEY,origin_job TEXT NOT NULL,question TEXT NOT NULL,genre TEXT NOT NULL,terms_json TEXT NOT NULL,references_json TEXT NOT NULL,priority REAL NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_inquiry_events(id TEXT PRIMARY KEY,inquiry_id TEXT NOT NULL,job_id TEXT,kind TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_inquiry_attempts(inquiry_id TEXT NOT NULL,job_id TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(inquiry_id,job_id));
      CREATE TABLE IF NOT EXISTS research_slot_plans(operation_id TEXT NOT NULL,slot TEXT NOT NULL,plan_json TEXT NOT NULL,PRIMARY KEY(operation_id,slot));
      CREATE TABLE IF NOT EXISTS research_interest_assessments(job_id TEXT PRIMARY KEY,status TEXT NOT NULL,provider TEXT NOT NULL,issues_json TEXT NOT NULL,candidate_count INTEGER NOT NULL,applied INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_interest_activity(interest_key TEXT PRIMARY KEY,active INTEGER NOT NULL CHECK(active IN (0,1)),updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_interest_appraisals(id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL,job_id TEXT NOT NULL,interest_key TEXT NOT NULL,genre TEXT NOT NULL,term TEXT NOT NULL,impact REAL NOT NULL,confidence REAL NOT NULL,direction TEXT NOT NULL,weighted_delta REAL NOT NULL,evaluation_json TEXT NOT NULL,applied INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(receipt_id,interest_key,term));
    `);
  }
  close(){this.db.close();}
  private atomic<T>(fn:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  private change(key:string,label:string,kind:string,boost:number,reason:string,receipt:string,now:number,job?:string,seen=boost>0){
    const at=new Date(now).toISOString();
    const initial=this.settings.initialScores[label]??(kind==='genre'?50:30);
    this.db.prepare('INSERT OR IGNORE INTO research_interests VALUES(?,?,?,?,0,NULL,?)').run(key,kind,label,initial,at);
    if(this.db.prepare('SELECT id FROM research_interest_events WHERE id=?').get(receipt))return;
    const previous=this.db.prepare('SELECT * FROM research_interests WHERE key=?').get(key)!;
    const score=clamp(Number(previous.score)+boost);
    this.db.prepare('INSERT INTO research_interest_events VALUES(?,?,?,?,?,?,?)').run(receipt,key,job??null,previous.score,score,reason,at);
    this.db.prepare('UPDATE research_interests SET score=?,observations=observations+?,last_seen_at=CASE WHEN ?>0 THEN ? ELSE last_seen_at END,decay_at=? WHERE key=?')
      .run(score,seen?1:0,seen?1:0,at,at,key);
  }
  private decay(now:number){
    for(const row of this.db.prepare('SELECT * FROM research_interests').all()){
      const intervals=Math.floor((now-Date.parse(String(row.decay_at)))/(this.settings.decayDays*day));if(intervals<=0)continue;
      const end=Date.parse(String(row.decay_at))+intervals*this.settings.decayDays*day;
      this.change(String(row.key),String(row.label),String(row.kind),-intervals*this.settings.decayPoints,`NO_RELATED_DISCOVERY: ${intervals} intervals`,hash(`${row.key}:decay:${end}`),end);
    }
  }
  reconcile(sources:ResearchSource[],now=Date.now()){
    return this.atomic(()=>{
      const at=new Date(now).toISOString();
      for(const genre of new Set(sources.flatMap(s=>s.genre?[s.genre]:[])))this.db.prepare('INSERT OR IGNORE INTO research_interests VALUES(?,?,?,?,0,NULL,?)').run(`genre:${genre}`,'genre',genre,this.settings.initialScores[genre]??50,at);
      // Decay is based on the last accounted interval, so polling and restarts
      // cannot repeatedly subtract the same week. Read-only snapshots never decay.
      this.decay(now);
      const rows=this.db.prepare(`SELECT j.id,j.input_json,a.created_at,c.data_json,s.data_json selected_json,v.data_json verification_json FROM jobs j JOIN articles a ON a.job_id=j.id JOIN checkpoints c ON c.job_id=j.id AND c.stage='analyze' JOIN checkpoints s ON s.job_id=j.id AND s.stage='selected-items' JOIN checkpoints v ON v.job_id=j.id AND v.stage='verify' WHERE NOT EXISTS(SELECT 1 FROM research_agenda_ingested x WHERE x.job_id=j.id) AND j.status IN ('succeeded','needs_review') ORDER BY a.created_at LIMIT 200`).all();
      let ingested=0,created=0;
      for(const row of rows){
        const analysis=JSON.parse(String(row.data_json)) as AnalysisResult,quality=analysis.quality,verification=JSON.parse(String(row.verification_json));
        const input=JSON.parse(String(row.input_json)),items=(JSON.parse(String(row.selected_json)).items??[]) as StoredItem[];
        const primary=items.find(i=>quality?.focusItemIds.includes(i.id)),genre=sources.find(s=>s.id===input.source.id)?.genre??sources.find(s=>s.feedUrl===input.source.feedUrl)?.genre??'science';
        if(primary&&quality?.reflection&&verification.status==='passed'&&verification.factCheckStatus!=='contradicted'){
          const version=primary.versionId??primary.contentHash;
          const novelty=hash(`${primary.id}:${(primary.content??primary.summary??primary.title).normalize('NFKC').replace(/\s+/g,' ')}`);
          const novel=this.db.prepare('INSERT OR IGNORE INTO research_interest_observations VALUES(?,?)').run(novelty,row.id).changes;
          const assessment=analysis.research?.interests;
          if(assessment)this.recordAssessment(assessment,primary,genre,novelty,String(row.id),Boolean(novel),Math.min(now,Date.parse(String(row.created_at))));
          if(novel&&(!assessment||assessment.status==='not-requested')){
            const observedAt=Math.min(now,Date.parse(String(row.created_at))),boost=quality.status==='grounded'?this.settings.discoveryBoost:this.settings.discoveryBoost/2;
            this.change(`genre:${genre}`,genre,'genre',boost,'RULE_SOURCE_BOUND_OBSERVATION; AI_EVALUATION_NOT_REQUESTED',hash(`${novelty}:genre`),observedAt,String(row.id));
            for(const term of [...meaningfulTerms(primary.title)].slice(0,3)){
              const key=`theme:${term}`;
              const exists=this.db.prepare('SELECT key FROM research_interests WHERE key=?').get(key);
              if(!exists&&Number(this.db.prepare("SELECT count(*) n FROM research_interests WHERE kind='theme'").get()?.n)>=this.settings.maxTopics)continue;
              this.change(key,term,'theme',boost,'RULE_THEME_FROM_SOURCE_HEADLINE; AI_EVALUATION_NOT_REQUESTED',hash(`${novelty}:${key}`),observedAt,String(row.id));
            }
          }
          const terms=[...meaningfulTerms(primary.title)].slice(0,12);
          const questions=[...(analysis.research?.questions??[]).slice(0,2),`「${primary.title}」の判断を再評価する条件: ${quality.reflection.revisionCondition}`].filter(q=>q.trim().length>=12).slice(0,3);
          for(const question of questions){
            const id=hash(`${primary.id}:${question.normalize('NFKC')}`);
            const added=this.db.prepare('INSERT OR IGNORE INTO research_inquiries VALUES(?,?,?,?,?,?,?,0,\'open\',?,?)')
              .run(id,row.id,question.slice(0,900),genre,JSON.stringify(terms),JSON.stringify([`${primary.id}:${version}`]),quality.status==='limited'?80:60,row.created_at,at).changes;
            if(added){created++;this.event(id,String(row.id),'created',{reason:'UNRESOLVED_QUESTION',sourceItemId:primary.id,versionId:version},now);}
          }
          // A new source/version can reopen a bounded inquiry; the same evidence
          // receipt never resets its attempts on another poll or crash recovery.
          if(novel)for(const inquiry of this.inquiries(100).filter(q=>q.origin_job!==row.id&&['exhausted','waiting_evidence'].includes(q.status)&&q.genre===genre)){
            if(inquiry.terms.filter(t=>meaningfulTerms(primary.title).has(t)).length<2)continue;
            const receipt=hash(`${inquiry.id}:new-evidence:${version}`);
            if(this.db.prepare('SELECT id FROM research_inquiry_events WHERE id=?').get(receipt))continue;
            this.db.prepare("UPDATE research_inquiries SET attempts=0,status='open',updated_at=? WHERE id=?").run(at,inquiry.id);
            this.event(inquiry.id,String(row.id),'new-evidence',{versionId:version,independentVerification:'unverified'},now,receipt);
          }
        }
        this.db.prepare('INSERT INTO research_agenda_ingested VALUES(?,?)').run(row.id,at);ingested++;
      }
      this.decay(now);
      let finished=0;
      for(const row of this.db.prepare("SELECT t.*,j.status job_status,c.data_json FROM research_inquiry_attempts t JOIN jobs j ON j.id=t.job_id LEFT JOIN checkpoints c ON c.job_id=j.id AND c.stage='analyze' WHERE t.status='selected' AND j.status IN ('succeeded','needs_review','failed','cancelled')").all()){
        const analysis=row.data_json?JSON.parse(String(row.data_json)) as AnalysisResult:null;
        // A hypothesis review is evidence for that hypothesis, not an answer to
        // every inquiry bound to this job. Retain the question until an explicit
        // inquiry-level answer can be grounded and reviewed.
        const resolved=false;
        const attempts=Number(this.db.prepare('SELECT attempts FROM research_inquiries WHERE id=?').get(row.inquiry_id)?.attempts??0);
        const status=resolved?'resolved':attempts>=this.settings.maxInquiryAttempts?'exhausted':'open';
        this.db.prepare('UPDATE research_inquiry_attempts SET status=? WHERE inquiry_id=? AND job_id=?').run(String(row.job_status),row.inquiry_id,row.job_id);
        this.db.prepare('UPDATE research_inquiries SET status=?,updated_at=? WHERE id=?').run(status,at,row.inquiry_id);
        this.event(String(row.inquiry_id),String(row.job_id),'attempt-finished',{status,jobStatus:row.job_status,hypothesisReviews:analysis?.quality?.hypothesisReviews?.length??0,evidenceConditionMatched:resolved,independentVerification:'unverified'},now);finished++;
      }
      return {ingested,created,finished};
    });
  }
  private event(id:string,job:string|null,kind:string,details:unknown,now:number,receipt=hash(`${id}:${job}:${kind}`)){
    this.db.prepare('INSERT OR IGNORE INTO research_inquiry_events VALUES(?,?,?,?,?,?)').run(receipt,id,job,kind,JSON.stringify(details),new Date(now).toISOString());
  }
  private recordAssessment(report:InterestAssessment,primary:StoredItem,genre:string,receipt:string,job:string,novel:boolean,now:number){
    const evaluations=Array.isArray(report.evaluations)?report.evaluations:[];
    const sound=report.status==='succeeded'&&evaluations.length>0&&evaluations.every(e=>e&&Number.isFinite(e.impact)&&Math.abs(e.impact)<=10&&Number.isFinite(e.confidence)&&e.confidence>=0&&e.confidence<=1&&e.reference?.itemId===primary.id&&e.reference.versionId===primary.versionId&&typeof e.theme==='string'&&e.theme.length<=80&&typeof e.reason==='string'&&e.reason.length>=8);
    const status=report.status==='succeeded'&&!sound?'failed':report.status;
    const issues=Array.isArray(report.issues)?report.issues:[];
    this.db.prepare('INSERT OR IGNORE INTO research_interest_assessments VALUES(?,?,?,?,?,?,?)').run(job,status,typeof report.provider==='string'?report.provider:'unknown',JSON.stringify([...issues,...(!sound&&report.status==='succeeded'?['INTEREST_PERSISTENCE_INVALID']:[])]),Array.isArray(report.candidates)?report.candidates.length:0,sound&&novel?1:0,new Date(now).toISOString());
    if(!sound||!novel)return;
    const themes=new Map<string,{label:string;delta:number;ids:string[]}>();
    for(const evaluation of evaluations){
      const key=`theme:${evaluation.theme.normalize('NFKC').toLowerCase()}`,id=hash(`${receipt}:${key}:${evaluation.term}`),delta=interestDelta(evaluation);
      this.db.prepare('INSERT OR IGNORE INTO research_interest_appraisals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,receipt,job,key,genre,evaluation.term,evaluation.impact,evaluation.confidence,evaluation.direction,delta,JSON.stringify(evaluation),0,new Date(now).toISOString());
      const group=themes.get(key)??{label:evaluation.theme,delta:0,ids:[]};group.delta+=delta;group.ids.push(id);themes.set(key,group);
    }
    for(const [key,value] of themes){
      if(!this.activateTheme(key,new Set(themes.keys()),receipt,now,job))continue;
      this.change(key,value.label,'theme',Math.max(-this.settings.discoveryBoost,Math.min(this.settings.discoveryBoost,value.delta)),`AI_CONTEXT_APPRAISAL: ${value.ids.join(',')}`,hash(`${receipt}:${key}:ai`),now,job,true);
      for(const id of value.ids)this.db.prepare('UPDATE research_interest_appraisals SET applied=1 WHERE id=?').run(id);
    }
    const delta=Math.round(evaluations.reduce((sum,e)=>sum+interestDelta(e),0)/evaluations.length*2)/2;
    this.change(`genre:${genre}`,genre,'genre',Math.max(-this.settings.discoveryBoost,Math.min(this.settings.discoveryBoost,delta)),`AI_APPRAISAL_AGGREGATE: ${evaluations.map(e=>`${e.term}:${e.direction}`).join('; ')}`,hash(`${receipt}:genre`),now,job,true);
  }
  private activateTheme(key:string,protectedKeys:Set<string>,receipt:string,now:number,job:string){
    if(this.interests().some(i=>i.key===key))return true;
    while(this.interests().filter(i=>i.kind==='theme').length>=this.settings.maxTopics){
      const old=this.interests().filter(i=>i.kind==='theme'&&!protectedKeys.has(i.key)).sort((a,b)=>a.score-b.score||a.decay_at.localeCompare(b.decay_at)||a.key.localeCompare(b.key))[0];if(!old)return false;
      this.db.prepare('INSERT INTO research_interest_activity VALUES(?,0,?) ON CONFLICT(interest_key) DO UPDATE SET active=0,updated_at=excluded.updated_at').run(old.key,new Date(now).toISOString());
      this.db.prepare('INSERT OR IGNORE INTO research_interest_events VALUES(?,?,?,?,?,?,?)').run(hash(`${receipt}:${old.key}:archive`),old.key,job,old.score,old.score,`THEME_ARCHIVED_FOR_NEW_DISCOVERY: ${key}; ORIGINAL_AND_HISTORY_RETAINED`,new Date(now).toISOString());
    }
    this.db.prepare('INSERT INTO research_interest_activity VALUES(?,1,?) ON CONFLICT(interest_key) DO UPDATE SET active=1,updated_at=excluded.updated_at').run(key,new Date(now).toISOString());return true;
  }
  interests(){const tracked=this.db.prepare("SELECT name FROM sqlite_master WHERE name='research_interest_activity'").get();return this.db.prepare(`SELECT * FROM research_interests ${tracked?"WHERE key NOT IN(SELECT interest_key FROM research_interest_activity WHERE active=0)":''} ORDER BY score DESC,key`).all() as unknown as Interest[];}
  inquiries(limit=100):Inquiry[]{return this.db.prepare("SELECT * FROM research_inquiries ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'selected' THEN 1 ELSE 2 END,priority DESC,created_at LIMIT ?").all(limit).map(r=>({id:String(r.id),origin_job:String(r.origin_job),question:String(r.question),genre:String(r.genre),terms:JSON.parse(String(r.terms_json)),references:JSON.parse(String(r.references_json)),priority:Number(r.priority),attempts:Number(r.attempts),status:String(r.status),created_at:String(r.created_at),updated_at:String(r.updated_at)}));}
  plan(operation:string,slot:string,sources:ResearchSource[],exploration:number,now=Date.now(),draw=randomInt(1_000_000)/1_000_000):SlotResearchPlan{
    const old=this.db.prepare('SELECT plan_json FROM research_slot_plans WHERE operation_id=? AND slot=?').get(operation,slot);if(old)return JSON.parse(String(old.plan_json));
    const interests=this.interests(),inquiries=this.inquiries().filter(q=>q.status==='open'&&q.attempts<this.settings.maxInquiryAttempts);
    const ranked=sources.map(s=>{
      const score=interests.find(i=>i.key===`genre:${s.genre}`)?.score??this.settings.initialScores[s.genre??'']??50;
      const need=Math.max(0,...inquiries.filter(q=>q.genre===s.genre).map(q=>q.priority/20+2/(1+Math.max(0,(now-Date.parse(q.created_at))/day))));
      return {id:s.id,score,candidateLimit:Math.min(20,2+Math.floor(score/10)),bodyLimit:score>=95?2:1,reason:`INTEREST=${score}; OPEN_INQUIRY_PRIORITY=${need}`,rank:score+need};
    }).sort((a,b)=>b.rank-a.rank||a.id.localeCompare(b.id));
    const count=Math.min(this.settings.maxSources,ranked.length),selected=ranked.slice(0,count);
    let explorationSource:string|null=null;
    if(ranked.length>count&&draw<exploration){const pool=ranked.slice(Math.max(0,count-1));const pick=pool[Math.min(pool.length-1,Math.floor(draw/Math.max(exploration,.000001)*pool.length))];selected[selected.length-1]=pick;explorationSource=pick.id;}
    const plan:SlotResearchPlan={createdAt:new Date(now).toISOString(),draw,explorationSource,sources:selected.map(s=>({id:s.id,score:s.score,candidateLimit:s.candidateLimit,bodyLimit:s.bodyLimit,reason:s.reason})),inquiryIds:inquiries.filter(q=>selected.some(s=>sources.find(source=>source.id===s.id)?.genre===q.genre)).slice(0,20).map(q=>q.id)};
    this.db.prepare('INSERT OR IGNORE INTO research_slot_plans VALUES(?,?,?)').run(operation,slot,JSON.stringify(plan));return JSON.parse(String(this.db.prepare('SELECT plan_json FROM research_slot_plans WHERE operation_id=? AND slot=?').get(operation,slot)!.plan_json));
  }
  rank(item:StoredItem,genre:string,now=Date.now()){
    const terms=meaningfulTerms(item.title),open=this.inquiries().filter(q=>q.status==='open'&&q.attempts<this.settings.maxInquiryAttempts&&q.genre===genre);
    const match=open.map(q=>({q,overlap:q.terms.filter(t=>terms.has(t)).length})).filter(v=>v.overlap>=2).sort((a,b)=>b.overlap-a.overlap||b.q.priority-a.q.priority)[0];
    const interest=this.interests().find(i=>i.key===`genre:${genre}`)?.score??50;
    const matched=this.interests().filter(i=>i.kind==='theme'&&(terms.has(i.label)||((i.label.includes(' ')||/[\p{Script=Han}\p{Script=Katakana}]/u.test(i.label))&&item.title.normalize('NFKC').toLowerCase().includes(i.label))));
    const theme=matched.length?matched.reduce((sum,i)=>sum+i.score,0)/matched.length:0;
    const age=item.publishedAt?Math.max(0,(now-Date.parse(item.publishedAt))/day):this.settings.freshDays;
    return {score:interest/20+theme/50+1/(1+age)+(match?3+match.overlap/3:0),inquiry:match?.q??null};
  }
  bind(jobId:string,inquiryIds:string[],now=Date.now()){
    this.atomic(()=>{for(const id of inquiryIds){
      const row=this.db.prepare('SELECT * FROM research_inquiries WHERE id=?').get(id);if(!row||row.status!=='open'||Number(row.attempts)>=this.settings.maxInquiryAttempts)continue;
      if(this.db.prepare("INSERT OR IGNORE INTO research_inquiry_attempts VALUES(?,?,'selected',?)").run(id,jobId,new Date(now).toISOString()).changes){
        this.db.prepare("UPDATE research_inquiries SET status='selected',attempts=attempts+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),id);
        this.event(id,jobId,'selected',{reason:'RELATED_NEW_DOCUMENT',attempt:Number(row.attempts)+1},now);
      }
    }});
  }
  deferPlan(plan:SlotResearchPlan,selectedIds:string[],operation:string,slot:string,now=Date.now()){
    for(const id of plan.inquiryIds.filter(id=>!selectedIds.includes(id))){
      this.event(id,null,'deferred',{reason:'NO_NEW_RELATED_DOCUMENT_WITHIN_SLOT_BUDGET',operation,slot},now,hash(`${id}:${operation}:${slot}:deferred`));
      const count=Number(this.db.prepare("SELECT count(*) n FROM research_inquiry_events WHERE inquiry_id=? AND kind='deferred' AND created_at>COALESCE((SELECT max(created_at) FROM research_inquiry_events WHERE inquiry_id=? AND kind='new-evidence'),'')").get(id,id)?.n);
      if(count>=3)this.db.prepare("UPDATE research_inquiries SET status='waiting_evidence',updated_at=? WHERE id=? AND status='open'").run(new Date(now).toISOString(),id);
    }
  }
  summary(){
    const interests=this.interests();const states=this.db.prepare('SELECT status,count(*) n FROM research_inquiries GROUP BY status').all();
    const assessmentCounts=this.db.prepare("SELECT name FROM sqlite_master WHERE name='research_interest_assessments'").get()?Object.fromEntries(this.db.prepare('SELECT status,count(*) n FROM research_interest_assessments GROUP BY status').all().map(r=>[String(r.status),Number(r.n)])):{};
    return {interests:interests.slice(0,20).map(i=>({topic:i.label,kind:i.kind,score:i.score,observations:i.observations,lastSeenAt:i.last_seen_at})),assessmentCounts,inquiries:this.inquiries(12),inquiryCounts:Object.fromEntries(states.map(r=>[String(r.status),Number(r.n)])),lastPlan:(()=>{const r=this.db.prepare('SELECT plan_json FROM research_slot_plans ORDER BY rowid DESC LIMIT 1').get();return r?JSON.parse(String(r.plan_json)) as SlotResearchPlan:null;})()};
  }
}
