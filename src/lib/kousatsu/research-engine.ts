import { createHash, randomInt, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { type AnalysisContext, type KousatsuAiProvider } from './ai';
import { buildQualityAnalysis } from './quality-analysis';
import { compareRecords, meaningfulTerms } from './relevance';
import {reflectionQuestion} from './reflection';
import type { KousatsuDatabase } from './database';
import type { AnalysisResult } from './types';

const stopwords = new Set('about after again also and are before being can comes could first for from has have into its more nasa news not now that the their there these they this through today united was were what when which who will with would library congress'.split(' '));

export function researchKeywords(text: string): string[] {
  const segmenter = new Intl.Segmenter('ja', {granularity:'word'});
  return [...new Set([...segmenter.segment(text.normalize('NFKC'))]
    .filter(part => part.isWordLike).map(part => part.segment.toLowerCase())
    .filter(word => word.length >= 3 && word.length <= 40 && !stopwords.has(word) && !/^\d+$/.test(word)))].slice(0,80);
}

export type TopicDecision = {topic: string; reason: string; candidates: string[]; draw: number; focusItemIds?:string[]};

/** Bounded, reproducible once persisted; randomness affects research questions, never source facts. */
export function selectResearchTopic(context: AnalysisContext, history: string[], exploration=0.25, draw=randomInt(1_000_000)/1_000_000): TopicDecision {
  const proposals=context.items.slice(0,30).filter(item=>meaningfulTerms(item.title).size>=3 || meaningfulTerms(item.summary??item.content??'').size>=5)
    .flatMap((item,index)=>[0,1].map(aspect=>({item,topic:aspect===0 ? `「${item.title.slice(0,180)}」を手掛かりに、${reflectionQuestion(item.title,context.claims.filter(c=>c.itemId===item.id).map(c=>c.text).join(' '))}` :
      `「${item.title.slice(0,180)}」について、自分の見方を変えるのはどんな情報か。`,
      score:(context.coverage?.some(c=>c.itemId===item.id && c.kind==='article-body')?5:0)+
        (item.summary || item.content ? 2:0)+1/(1+index)-aspect*0.1}))).sort((a,b)=>b.score-a.score);
  const candidates = [...new Set(proposals.map(p=>p.topic))];
  if(!candidates.length) return {topic:`「${context.topic}」の資料は考察に十分か。`,reason:'具体的な出来事を含む資料が不足しているため調査を保留。',candidates:[],draw,focusItemIds:[]};
  const fresh = candidates.filter(candidate => !history.slice(0,6).includes(candidate));
  const pool = fresh.length ? fresh : candidates;
  const exploratory = draw < exploration;
  const index = exploratory ? Math.min(pool.length-1,Math.floor(draw / Math.max(exploration,0.000001) * pool.length)) : 0;
  const topic = pool[index];
  const primary=proposals.find(p=>p.topic===topic)!.item;
  const focusItemIds=[primary.id,...context.items.filter(item=>item.id!==primary.id &&
    ['same_document','follow_up_candidate','same_issue_candidate'].includes(compareRecords(primary,item).kind)).slice(0,2).map(item=>item.id)];
  return {topic,candidates,draw,focusItemIds,reason: `${exploratory ? '出来事を含む問いから探索抽選' : '本文の充足度と取得順を優先'}。直近6回の問いを可能な範囲で除外。候補${candidates.length}件、探索率${exploration}。`};
}

export class TopicHistory {
  private readonly db: DatabaseSync;
  constructor(file: string) {
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS autonomy_decisions(job_id TEXT PRIMARY KEY REFERENCES jobs(id), decision_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS autonomy_runs(id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, details_json TEXT);
      CREATE TABLE IF NOT EXISTS autonomy_artifacts(path TEXT PRIMARY KEY, contents TEXT NOT NULL, digest TEXT NOT NULL, job_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS autonomy_repairs(id INTEGER PRIMARY KEY, path TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS autonomy_supervisor(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,expires_at TEXT NOT NULL);
    `);
  }
  close() {this.db.close();}
  acquireSupervisor(now=Date.now()) {
    const token=randomUUID();
    const result=this.db.prepare(`INSERT INTO autonomy_supervisor VALUES(1,?,?) ON CONFLICT(id) DO UPDATE
      SET token=excluded.token,expires_at=excluded.expires_at WHERE autonomy_supervisor.expires_at<=?`)
      .run(token,new Date(now+90000).toISOString(),new Date(now).toISOString());
    return result.changes ? token : null;
  }
  renewSupervisor(token: string) {
    const now=new Date().toISOString();
    const result=this.db.prepare('UPDATE autonomy_supervisor SET expires_at=? WHERE id=1 AND token=? AND expires_at>?')
      .run(new Date(Date.now()+90000).toISOString(),token,now);
    if (!result.changes) throw new Error('SUPERVISOR_LEASE_LOST');
  }
  releaseSupervisor(token: string) {this.db.prepare('UPDATE autonomy_supervisor SET expires_at=? WHERE token=?').run(new Date(0).toISOString(),token);}
  recoverRuns() {this.db.prepare("UPDATE autonomy_runs SET status='interrupted',finished_at=? WHERE status='running'").run(new Date().toISOString());}
  decision(jobId: string, context: AnalysisContext, exploration: number) {
    const old=this.db.prepare('SELECT decision_json FROM autonomy_decisions WHERE job_id=?').get(jobId);
    if (old) return JSON.parse(String(old.decision_json)) as TopicDecision;
    const history=this.db.prepare('SELECT decision_json FROM autonomy_decisions ORDER BY created_at DESC,rowid DESC LIMIT 20').all()
      .map(row => (JSON.parse(String(row.decision_json)) as TopicDecision).topic);
    const decision=selectResearchTopic(context,history,exploration);
    this.db.prepare('INSERT OR IGNORE INTO autonomy_decisions VALUES(?,?,?)').run(jobId,JSON.stringify(decision),new Date().toISOString());
    return JSON.parse(String(this.db.prepare('SELECT decision_json FROM autonomy_decisions WHERE job_id=?').get(jobId)!.decision_json)) as TopicDecision;
  }
  beginRun() {return Number(this.db.prepare("INSERT INTO autonomy_runs(started_at,status) VALUES(?,'running')").run(new Date().toISOString()).lastInsertRowid);}
  finishRun(id: number, status: string, details: unknown) {this.db.prepare('UPDATE autonomy_runs SET finished_at=?,status=?,details_json=? WHERE id=?').run(new Date().toISOString(),status,JSON.stringify(details),id);}
  manifest(file: string, contents: string, jobId?: string) {
    const digest=createHash('sha256').update(contents).digest('hex');
    this.db.prepare('INSERT OR IGNORE INTO autonomy_artifacts VALUES(?,?,?,?,?)').run(file,contents,digest,jobId ?? null,new Date().toISOString());
    const row=this.db.prepare('SELECT contents,digest FROM autonomy_artifacts WHERE path=?').get(file)!;
    if (row.contents!==contents || row.digest!==digest) throw new Error('KNOWLEDGE_MANIFEST_CONFLICT');
  }
  artifacts() {return this.db.prepare('SELECT path,contents,digest FROM autonomy_artifacts ORDER BY path').all() as Array<{path:string;contents:string;digest:string}>;}
  repair(file: string, status: string) {
    if (this.db.prepare('SELECT status FROM autonomy_repairs WHERE path=? ORDER BY id DESC LIMIT 1').get(file)?.status===status) return;
    this.db.prepare('INSERT INTO autonomy_repairs(path,status,created_at) VALUES(?,?,?)').run(file,status,new Date().toISOString());
  }
}

export function safeDiagnostic(error: unknown) {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    .replace(/https?:\/\/[^\s]+/g, url => {try {const u=new URL(url);return `${u.protocol}//${u.host}${u.pathname}`;} catch {return '[URL]';}})
    .replace(/(api[_-]?key|authorization|token|password|secret)\s*[:=]\s*\S+/gi,'$1=[redacted]').slice(0,1000);
}

/** A stable provider identity keeps retries compatible even if Ollama is offline. */
export class ResearchEngine implements KousatsuAiProvider {
  readonly id='autonomous';
  readonly model='research-v3';
  readonly configurationFingerprint: string;
  constructor(private readonly options: {jobId: string; database: KousatsuDatabase; history: TopicHistory;
    provider: KousatsuAiProvider; exploration: number}) {
    this.configurationFingerprint=createHash('sha256').update(JSON.stringify({engine:3,provider:options.provider.configurationFingerprint ?? options.provider.model,exploration:options.exploration})).digest('hex');
  }
  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const decision=this.options.history.decision(this.options.jobId,context,this.options.exploration);
    // Search previously fetched documents only. Match is a lead, not semantic refutation.
    const focusIds=decision.focusItemIds ?? context.items.slice(0,1).map(item=>item.id);
    const focus=context.items.filter(item=>focusIds.includes(item.id));
    const keys=[...meaningfulTerms(focus[0]?.title ?? '')].slice(0,4);
    const current=new Set(context.items.map(item => item.id));
    const matches=keys.flatMap(key => this.options.database.search(key,10));
    const counterSearch=[...new Map(matches.filter(item => !current.has(item.id) && focus.some(f=>
      ['same_document','follow_up_candidate','same_issue_candidate'].includes(compareRecords(f,item).kind))).map(item => [item.id,item])).values()].slice(0,4)
      .map(item => ({itemId:item.id,versionId:item.versionId!,title:item.title,url:item.url,
        excerpt:(item.summary ?? item.title).slice(0,300),reason:'同じ対象・問題の追加資料候補。論理的な反証と情報源の独立性は未確認。'}));
    const started=Date.now();
    let proposal:unknown;
    let used='deterministic/reflection-v3';
    let error: string|null=null;
    const selected={...context,topic:decision.topic,items:focus,claims:context.claims.filter(c=>focusIds.includes(c.itemId!)),
      memories:(context.memories??[]).filter(m=>m.quality?.reflection&&m.references.some(ref=>{
        if(focusIds.includes(ref.itemId))return true;
        const old=this.options.database.getItemVersion(ref.versionId);
        return old&&focus.some(item=>['same_document','follow_up_candidate','same_issue_candidate'].includes(compareRecords(old,item).kind));
      })).slice(0,2)};
    if(focus.length)try {
      if(this.options.provider.proposeGrounded) {proposal=await this.options.provider.proposeGrounded(selected);used=`${this.options.provider.id}/${this.options.provider.model}`;}
      else if(this.options.provider.id!=='deterministic') {await this.options.provider.analyze(selected);error='MODEL_SOURCE_BINDINGS_REQUIRED';}
    } catch(e) {error=safeDiagnostic(e);}
    const quality=buildQualityAnalysis(context,decision.topic,focusIds,proposal);
    for(const entry of quality.priorMemory.filter(m=>m.decision==='excluded')) {
      const memory=context.memories?.find(m=>m.id===entry.id);
      if(!memory?.quality)continue;
      for(const reference of memory.references) {
        const old=this.options.database.getItemVersion(reference.versionId);
        const currentItem=old && focus.find(item=>['same_document','follow_up_candidate','same_issue_candidate'].includes(compareRecords(old,item).kind));
        if(!old || !currentItem)continue;
        entry.decision='related';
        entry.reason=`過去の根拠「${old.title}」（版 ${old.versionId}）と今回の「${currentItem.title}」（版 ${currentItem.versionId}）は同じ対象の候補。${old.canonicalUrl===currentItem.canonicalUrl ? (old.content===currentItem.content ? '保存本文は同じであり、新しい裏付けとは数えない。' : '保存本文に変更があるため旧解釈を再評価する。') : '別文書の続報候補であり、同一事件・独立性・支持と反証の成立は未確認。'}`;
        break;
      }
    }
    if(quality.modelIssues.length)error=[error,...quality.modelIssues].filter(Boolean).join('; ');
    const summary=`${quality.reflection!.position} 理由: ${quality.reflection!.reasoning}`;
    const analysis:AnalysisResult={quality,summary,provider:used.split('/')[0],model:used.split('/')[1],hypotheses:quality.hypotheses.map(h=>({text:h.text,
      rationale:`前提: ${h.premiseClaimIds.join(', ')} / 予測: ${h.prediction} / 反証: ${h.falsification} / 代替説明: ${h.alternative} / 必要資料: ${h.requiredEvidence}`}))};
    const research: NonNullable<AnalysisResult['research']>={
      topic:decision.topic,reason:decision.reason,candidates:decision.candidates,
      memories:[],
      evidence:selected.claims.filter(claim => claim.itemId && claim.versionId).slice(0,8).map(claim => ({
        claimId:claim.id,itemId:claim.itemId!,versionId:claim.versionId!,excerpt:claim.text.slice(0,300),
        url:context.items.find(item => item.id===claim.itemId)!.url,
      })),counterSearch,
      questions:[`「${decision.topic}」の記述は別の独立した情報源でも確認できるか。`,
        `「${decision.topic}」に関する過去の仮説は、文書版の更新によって維持できなくなるか。`,
        '継続的な現象という解釈と、配信元の選択・報道頻度の偏りという解釈を、時系列と異なる配信元で比較する。'],
      model:{requested:`${this.options.provider.id}/${this.options.provider.model}`,used:`${analysis.provider}/${analysis.model}`,elapsedMs:Date.now()-started,error},
    };
    return {...analysis,research};
  }
}
