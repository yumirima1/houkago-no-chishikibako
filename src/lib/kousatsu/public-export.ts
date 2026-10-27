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
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const line=(s:string)=>s.replace(/[\r\n]/g,' ').slice(0,2000);
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
    const rows=db.prepare(`SELECT a.id,a.job_id,a.title,a.created_at,a.provider,a.model,c.data_json,s.data_json selected_json,v.data_json verification_json,j.input_json
      FROM articles a JOIN jobs j ON j.id=a.job_id JOIN checkpoints c ON c.job_id=a.job_id AND c.stage='analyze'
      JOIN checkpoints s ON s.job_id=a.job_id AND s.stage='selected-items' JOIN checkpoints v ON v.job_id=a.job_id AND v.stage='verify'
      WHERE j.status IN ('succeeded','needs_review') ORDER BY a.created_at DESC,a.id`).all();
    // Freeze public projections. Model changes never rewrite already published views.
    for(const row of rows){
      if(db.prepare('SELECT article_id FROM public_documents WHERE article_id=?').get(row.id))continue;
      if(decisions.find(d=>d.articleId===row.id)?.kind!=='eligible')continue;
      const analysis=JSON.parse(String(row.data_json)) as AnalysisResult,q=analysis.quality;
      const verification=JSON.parse(String(row.verification_json));
      if(!q?.reflection||verification.status!=='passed'||verification.factCheckStatus==='contradicted')continue;
      const items=(JSON.parse(String(row.selected_json)).items as StoredItem[]).filter(i=>q.focusItemIds.includes(i.id));
      if(!items.length)continue;
      // Historical model experiments can contain several notes for one source article.
      // Keep the frozen published view, or choose the newest eligible view once.
      const published=db.prepare('SELECT news_json FROM public_documents').all();
      const revisionOf=decisions.find(d=>d.articleId===row.id)?.revisionOf;
      if(!revisionOf&&published.some(r=>{const news=JSON.parse(String(r.news_json));return news.id===items[0].id||news.url===items[0].url;}))continue;
      const view=q.reflection,input=JSON.parse(String(row.input_json));
      const source=sources.find(s=>s.id===input.source.id)||sources.find(s=>new URL(s.feedUrl).hostname===new URL(input.source.feedUrl).hostname);
      const genre=source?.genre??'science';
      // Keep the research view and a short attributed excerpt; raw page bodies stay local.
      const clean=(value:string)=>{
        let text=value;for(const observation of q.observations)if(observation.quote.length>80)text=text.replaceAll(observation.quote,'出典の該当記述');
        return line(text).replace(/(?:[A-Z]:[\\/][^\s。]+)/g,'[ローカル保存先]');
      };
      const primary=items[0],observation=q.observations.find(o=>o.itemId===primary.id&&o.kind!=='metadata'),quote=observation?excerpt(observation.quote):'';
      const markdown=[`# ${line(String(row.title))}`,'',`作成: ${row.created_at}`,`ジャンル: ${genre}`,`生成: ${analysis.provider}/${analysis.model} / ${analysis.research?.model.elapsedMs??'不明'} ms`,'',
        '## 出典で確認できる主張（独立検証は未実施）','',`[${line(primary.title)}](${primary.url}) — ${line(input.source.name)}`,
        `公開: ${primary.publishedAt??'不明'} / 取得: ${primary.fetchedAt} / 文書版: ${primary.versionId}`,quote?`\n> ${quote}\n\n※本文からの短い抜粋。発表主体の主張であり独立した事実確認ではありません。`:'本文の確認範囲は限定されています。題名から具体的な結果を補っていません。','',
        '## 考察の問い','',clean(view.issue),'','## 現時点の見解（推論）','',clean(view.position),'','## 理由','',clean(view.reasoning),'',
        '## 別の説明','',clean(view.alternative),'','## 見解を修正する条件','',clean(view.revisionCondition),'',
        `確信度: ${view.confidence}（見解への暫定評価。事実確認の確率ではありません） / 生成: ${view.origin}`,'',
        '## 仮定・未解決の問い','',...view.assumptions.map(s=>`- ${clean(s)}`),...q.unresolved.slice(0,3).map(s=>`- ${clean(s)}`),'',
        ...(q.sourceVerification?['## 出典照合（保存済み資料の範囲）','',`照合した主張: ${q.sourceVerification.claims.length}件。独立した事実確認は未完了。`,...q.sourceVerification.claims.map(c=>`- ${c.claimId}: ${c.result}${c.comparisons.length?` / ${c.comparisons.map(p=>`[追加資料](${p.url}): ${p.kind}`).join(' / ')}`:' / 独立した別資料を確認できていない'}`),'']:[]),
        ...(analysis.research?.questions.length?['## 次に調べること','',...analysis.research.questions.slice(0,3).map(s=>`- ${clean(s)}`),'']:[]),
        ...(q.priorMemory.some(m=>m.decision==='related')?['## 関連する過去の考察','',...q.priorMemory.filter(m=>m.decision==='related').map(m=>`- ${clean(m.reason)}`),'']:[]),
        ...(q.viewReviews?.length?['## 過去の見解の再評価','',...q.viewReviews.map(r=>`- ${r.action}: ${clean(r.reason)}`),'']:[]),
        '取得記事の全文と詳細な実行ログはローカルで保存。未観測の結果は補っていません。',''].join('\n');
      const payload={id:String(row.id),title:String(row.title),markdown,genre,...(revisionOf?{revisionOf}:{}),provider:analysis.provider,model:analysis.model,status:'generated',artifact:'matching',verification:{status:'passed',scope:'structure-and-references',factCheckStatus:'unverified'}};
      const news={id:primary.id,title:primary.title,source:input.source.name,url:primary.url,publishedAt:primary.publishedAt??null,fetchedAt:primary.fetchedAt,summary:quote,content:quote,truncated:true,genre};
      db.prepare('INSERT OR IGNORE INTO public_documents VALUES(?,?,?,?)').run(row.id,JSON.stringify(payload),JSON.stringify(news),row.created_at);
    }
    const documents=db.prepare('SELECT * FROM public_documents ORDER BY created_at DESC,article_id').all();
    if(!documents.length)throw Error('PUBLIC_EXPORT_EMPTY: previous public files retained');
    let operation:unknown=null;
    if(config.operation){const store=new WeeklyStore(file);try{const state=store.snapshot(config.operation);operation={...state,days:state.days.map(d=>({...d,collection:undefined,articles:d.articles.map(a=>({...a,error:a.error?'処理失敗。ローカルログに詳細を記録。':null}))}))};}finally{store.close();}}
    const latest=documents[0]?.created_at??config.operation?.startsAt??new Date(0).toISOString();
    let research:unknown=undefined;
    if(db.prepare("SELECT name FROM sqlite_master WHERE name='research_interests'").get()){
      const agenda=new ResearchAgenda(file,config.agenda,{readOnly:true});try{const summary=agenda.summary();research={openInquiries:(summary.inquiryCounts.open??0)+(summary.inquiryCounts.selected??0),exhaustedInquiries:(summary.inquiryCounts.exhausted??0)+(summary.inquiryCounts.waiting_evidence??0),interestScores:summary.interests.filter(i=>i.kind==='genre').map(i=>({genre:i.topic,score:i.score})),lastSelection:summary.lastPlan?{sources:summary.lastPlan.sources.map(s=>({id:s.id,score:s.score,candidateLimit:s.candidateLimit}))}:null};}finally{agenda.close();}
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
      files[`public/research/notes/${row.article_id}.json`]=JSON.stringify({...payload,generation,sources:[{title:news.title,url:news.url}],...(checks?{sourceVerification:{scope:checks.method,checkedClaims:checks.claims.length,conflictCandidates:checks.claims.filter(c=>c.result==='conflict-candidate').length,independentVerification:'unverified'}}:{})})+'\n';files[`public/research/notes/${row.article_id}.md`]=payload.markdown;
    }
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
