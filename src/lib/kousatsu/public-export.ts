import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,rename,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {autonomousPaths,type AutonomousConfig} from './autonomous-config';
import type {AnalysisResult,StoredItem} from './types';
import type {ResearchSource} from './runtime-types';
import {WeeklyStore} from './weekly-store';
import {auditPublicArticles,publicDecisionCounts} from './public-audit';
import {ResearchAgenda} from './research-agenda';
import {publicText,publicUrl,savedReasoning,originalNoteDigest,assertPublicSafety} from './public-projection';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const excerpt=(s:string)=>s.trim().split(/\s+/).slice(0,20).join(' ').slice(0,180);
export async function exportPublicResearch(config:AutonomousConfig,sources:ResearchSource[]){
  const file=autonomousPaths(config).database,db=new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS public_documents(article_id TEXT PRIMARY KEY,payload_json TEXT NOT NULL,news_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER NOT NULL,next_at TEXT NOT NULL,status TEXT NOT NULL,error TEXT,commit_sha TEXT);`);
  db.exec('CREATE TABLE IF NOT EXISTS public_article_decisions(article_id TEXT PRIMARY KEY,kind TEXT NOT NULL,reason TEXT NOT NULL,duplicate_of TEXT,checked_at TEXT NOT NULL)');
  try{
    db.exec('BEGIN IMMEDIATE');
    const decisions=auditPublicArticles(db);
    for(const d of decisions)db.prepare('INSERT INTO public_article_decisions VALUES(?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET kind=excluded.kind,reason=excluded.reason,duplicate_of=excluded.duplicate_of,checked_at=excluded.checked_at WHERE kind<>excluded.kind OR reason<>excluded.reason OR duplicate_of IS NOT excluded.duplicate_of')
      .run(d.articleId,d.kind,d.reason,d.duplicateOf,new Date().toISOString());
    const rows=db.prepare(`SELECT a.id,a.job_id,a.title,a.markdown,a.created_at,a.provider,a.model,c.data_json,s.data_json selected_json,v.data_json verification_json,j.input_json,j.status job_status
      FROM articles a JOIN jobs j ON j.id=a.job_id LEFT JOIN checkpoints c ON c.job_id=a.job_id AND c.stage='analyze'
      LEFT JOIN checkpoints s ON s.job_id=a.job_id AND s.stage='selected-items' LEFT JOIN checkpoints v ON v.job_id=a.job_id AND v.stage='verify'
      ORDER BY a.created_at DESC,a.id`).all();
    for(const row of rows){
      if(db.prepare('SELECT article_id FROM public_documents WHERE article_id=?').get(row.id))continue;
      if(decisions.find(d=>d.articleId===row.id)?.kind!=='eligible')continue;
      const analysis=row.data_json?JSON.parse(String(row.data_json)) as AnalysisResult:null,q=analysis?.quality;
      const verification=row.verification_json?JSON.parse(String(row.verification_json)):null;
      const input=JSON.parse(String(row.input_json));
      const items=(row.selected_json?JSON.parse(String(row.selected_json)).items??[]:[]) as StoredItem[];
      const primary=items.find(i=>q?.focusItemIds.includes(i.id))??items[0];
      const source=sources.find(s=>s.id===input.source.id)||sources.find(s=>s.feedUrl===input.source.feedUrl),genre=source?.genre??'science';
      const clean=(v:string)=>publicText(v);
      const revisionOf=decisions.find(d=>d.articleId===row.id)?.revisionOf;
      const reviewNeeded=verification?.status!=='passed'||verification?.factCheckStatus==='contradicted'||analysis?.research?.model.status==='failed'||q?.modelIssues.length;
      const label=reviewNeeded?'要確認・追加調査が必要':q?.reflection?'未検証の暫定見解':'旧形式・未検証';
      const reasoning=savedReasoning(String(row.markdown));
      // Saved prose remains as written. Omit source-body dumps and runtime logs,
      // not counterarguments, uncertainty, legacy views or failed-check notes.
      const fallback=!reasoning?clean(analysis?.summary??'保存された記録は旧形式で、公開可能な考察本文を抽出できていない。原記録は保全している。'):reasoning;
      const sourcesForNote=items.flatMap(i=>{const url=publicUrl(i.url);return url?[{title:clean(i.title),url}]:[];});
      const relatedMemoryJobs=[...new Set(analysis?.research?.memories.map(m=>m.jobId)??[])];
      const related=rows.filter(r=>relatedMemoryJobs.includes(String(r.job_id))).map(r=>String(r.id));
      const inquiries=db.prepare("SELECT name FROM sqlite_master WHERE name='research_inquiries'").get()?db.prepare('SELECT id,question,status FROM research_inquiries WHERE origin_job=? OR id IN (SELECT inquiry_id FROM research_inquiry_attempts WHERE job_id=?) ORDER BY created_at LIMIT 20').all(row.job_id,row.job_id):[];
      const markdown=[`# ${clean(String(row.title))}`,'',`作成: ${row.created_at}`,`研究テーマ: ${clean(analysis?.research?.topic??input.topic)}`,`ジャンル: ${genre}`,`検証状態: ${label}。独立した事実確認は未実施。`,'',
        '保存時の考察を掲載しています。品質検査の不合格・未解決の結論も含みます。長い出典原文と内部実行記録は公開版では省略しています。','',fallback,'',
        ...(q?.reflection?['## 見解を修正する条件','',clean(q.reflection.revisionCondition),'']:[]),
        '## 参考情報','',...sourcesForNote.map(i=>`- [${i.title}](${i.url})`),'',
        ...(related.length?['## 関連する過去の考察','',...related.map(id=>`- 考察ID: ${id}`),'']:[]),
        ...(inquiries.length?['## 関連する研究課題','',...inquiries.map(i=>`- ${clean(String(i.question))}（${i.status}）`),'']:[]),
      ].join('\n');
      const payload={id:String(row.id),title:clean(String(row.title)),markdown,genre,...(revisionOf?{revisionOf}:{}),provider:String(row.provider),model:String(row.model),status:reviewNeeded?'needs_review':'generated',artifact:'matching',
        verification:{status:verification?.status??'failed',scope:'structure-and-references',factCheckStatus:verification?.factCheckStatus??'unverified',issues:[]},
        validationLabel:label,sourceNoteDigest:originalNoteDigest(String(row.markdown)),sources:sourcesForNote,relatedNoteIds:related,relatedInquiries:inquiries.map(i=>({id:i.id,question:clean(String(i.question)),status:i.status}))};
      const quote=q?.observations.find(o=>o.itemId===primary?.id&&o.kind!=='metadata');
      const short=quote?clean(excerpt(quote.quote)):'';
      const news={id:primary?.id??String(row.id),title:clean(primary?.title??String(row.title)),source:clean(input.source.name),url:publicUrl(primary?.url??input.source.feedUrl)??'',publishedAt:primary?.publishedAt??null,fetchedAt:primary?.fetchedAt??row.created_at,summary:short,content:short,truncated:true,genre};
      db.prepare('INSERT OR IGNORE INTO public_documents VALUES(?,?,?,?)').run(row.id,JSON.stringify(payload),JSON.stringify(news),row.created_at);
    }
    const documents=db.prepare('SELECT * FROM public_documents ORDER BY created_at DESC,article_id').all();
    if(!documents.length)throw Error('PUBLIC_EXPORT_EMPTY: previous public files retained');
    let operation:unknown=null;
    if(config.operation){const store=new WeeklyStore(file);try{const state=store.snapshot(config.operation);operation={...state,days:state.days.map(d=>({...d,collection:undefined,articles:d.articles.map(a=>({...a,error:a.error?'処理失敗。ローカルログに詳細を記録。':null,model:a.model?{...a.model,error:a.model.error?'MODEL_FAILED_OR_LIMITED':null}:null}))}))};}finally{store.close();}}
    const latest=documents[0]?.created_at??config.operation?.startsAt??new Date(0).toISOString();
    let research:unknown=undefined;
    if(db.prepare("SELECT name FROM sqlite_master WHERE name='research_interests'").get()){
      const agenda=new ResearchAgenda(file,config.agenda,{readOnly:true});try{const summary=agenda.summary();research={openInquiries:(summary.inquiryCounts.open??0)+(summary.inquiryCounts.selected??0)+(summary.inquiryCounts.partially_resolved??0),exhaustedInquiries:(summary.inquiryCounts.exhausted??0)+(summary.inquiryCounts.waiting_evidence??0),interestScores:agenda.interests().filter(i=>i.kind==='genre').map(i=>({genre:i.label,score:i.score})),lastSelection:summary.lastPlan?{sources:summary.lastPlan.sources.map(s=>({id:s.id,score:s.score,candidateLimit:s.candidateLimit}))}:null};}finally{agenda.close();}
    }
    const snapshot={initialized:documents.length>0,sources:sources.map(s=>({id:s.id,name:s.name,enabled:s.enabled,genre:s.genre,topic:s.topic,intervalMinutes:s.intervalMinutes})),
      worker:{active:false,lastSeenAt:latest},notes:documents.map(r=>{const p=JSON.parse(String(r.payload_json));return {id:p.id,jobId:p.id,title:p.title,createdAt:r.created_at,genre:p.genre,status:p.status,provider:p.provider,model:p.model,published:true};}),
      news:[...new Map(documents.map(r=>{const n=JSON.parse(String(r.news_json));return [n.id,n] as const;}).reverse()).values()].reverse(),jobs:documents.map(r=>{
        const job=db.prepare('SELECT j.* FROM jobs j JOIN articles a ON a.job_id=j.id WHERE a.id=?').get(r.article_id)!;
        const note=JSON.parse(String(r.payload_json));return {id:String(job.id),topic:note.title,status:String(job.status),stage:job.current_stage,error:null,queue:'done',createdAt:job.created_at};
      }),memories:[],interests:[],operation,...(research?{research}:{}),
      archive:{saved:decisions.length,selected:documents.length,excluded:publicDecisionCounts(decisions.filter(d=>!documents.some(r=>r.article_id===d.articleId)))},
      system:{readAt:latest,supervisorActive:false,pollSeconds:config.pollSeconds,maxJobsPerCycle:config.maxJobsPerCycle,provider:config.ai.provider,model:config.ai.model,access:'read-only'}};
    const files:Record<string,string>={'public/research/snapshot.json':JSON.stringify(snapshot,null,2)+'\n'};
    for(const row of documents){
      const payload=JSON.parse(String(row.payload_json));
      const analysisRow=db.prepare("SELECT c.data_json FROM checkpoints c JOIN articles a ON a.job_id=c.job_id WHERE a.id=? AND c.stage='analyze'").get(row.article_id);
      const analysis=analysisRow?JSON.parse(String(analysisRow.data_json)) as AnalysisResult:null;
      const model=analysis?.research?.model;
      const generation={origin:analysis?.quality?.reflection?.origin??'rules',requested:model?.requested??null,used:model?.used??null,elapsedMs:model?.elapsedMs??null,
        ...(model?.status?{modelStatus:model.status}:{}),
        issues:(model?.error??'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>/^[A-Z][A-Z_]+$/.test(s)?s:s.includes('Timeout')?'MODEL_TIMEOUT':'MODEL_UNAVAILABLE')};
      const news=JSON.parse(String(row.news_json));
      const checks=analysis?.quality?.sourceVerification;
      files[`public/research/notes/${row.article_id}.json`]=JSON.stringify({...payload,generation,sources:payload.sources??[{title:news.title,url:news.url}],...(checks?{sourceVerification:{scope:checks.method,checkedClaims:checks.claims.length,conflictCandidates:checks.claims.filter(c=>c.result==='conflict-candidate').length,independentVerification:'unverified'}}:{})})+'\n';files[`public/research/notes/${row.article_id}.md`]=payload.markdown;
    }
    assertPublicSafety(files);
    if(documents.length!==rows.filter(r=>String(r.markdown).trim()).length)throw Error('PUBLIC_ARCHIVE_COUNT_MISMATCH');
    db.exec('COMMIT');
    const directory=path.join(config.dataDirectory,'Publishing','export');
    for(const [relative,contents]of Object.entries(files)){
      const target=path.join(directory,relative);await mkdir(path.dirname(target),{recursive:true});
      if(relative.endsWith('.md'))try{if(await readFile(target,'utf8')!==contents)throw Error('PUBLIC_ARTIFACT_CONFLICT: '+relative);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      const temp=target+`.${randomUUID()}.tmp`;await writeFile(temp,contents);await rename(temp,target);
    }
    return {files,directory,digest:hash(JSON.stringify(files)),notes:documents.length,operation};
  }finally{if(db.isTransaction)db.exec('ROLLBACK');db.close();}
}
