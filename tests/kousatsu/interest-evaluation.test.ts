import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {DeterministicProvider,type AnalysisContext,type KousatsuAiProvider} from '../../src/lib/kousatsu/ai';
import {extractInterestCandidates,assessInterests} from '../../src/lib/kousatsu/interest-evaluation';
import {ResearchAgenda,agendaDefaults} from '../../src/lib/kousatsu/research-agenda';
import {ResearchEngine,TopicHistory} from '../../src/lib/kousatsu/research-engine';
import {ResearchRuntime} from '../../src/lib/kousatsu/runtime-service';
import {parseResearchSources} from '../../src/lib/kousatsu/runtime-config';
import {parseAutonomousConfig} from '../../src/lib/kousatsu/autonomous-config';
import {parseWeeklyOperation} from '../../src/lib/kousatsu/weekly-config';
import {planWeekly} from '../../src/lib/kousatsu/weekly-service';
import {collectFeedXml} from '../../src/lib/kousatsu/ingest';
import type {AnalysisResult,StoredItem} from '../../src/lib/kousatsu/types';
const item={id:'source',versionId:'version',sourceId:'science',title:'Artemis radiation shielding measurements compare instrument calibration',url:'https://example.org/article',canonicalUrl:'https://example.org/article',content:'Artemis radiation shielding measurements compare instrument calibration in controlled experiments.',fetchedAt:new Date().toISOString(),contentHash:'hash'} as StoredItem;
const context:AnalysisContext={items:[item],claims:[],relations:[],topic:item.title,interestCandidates:extractInterestCandidates([item]),interestBasis:[{key:'genre:science',label:'science',score:49}]};
function appraisals(c:AnalysisContext,impact=10){return c.interestCandidates!.map(target=>({candidateId:target.id,theme:target.term,impact,reason:impact>0?'測定条件の違いを調べると既存の関心に新しい比較軸を加えられる。':'同じ測定法への過度な集中を避けるため調査配分を下げたい。',confidence:1,direction:impact>0?'strengthen':'aversion',relatedInterestKeys:c.interestBasis?.some(i=>i.key==='genre:science')?['genre:science']:[],memoryIds:(c.memories??[]).slice(0,1).map(m=>m.id)}));}

test('source words and a compound concept have actual quotations and distinct appraisal and theme scores',()=>{
 assert.equal(context.interestCandidates!.length,3);assert.ok(context.interestCandidates!.some(c=>c.kind==='concept'));for(const c of context.interestCandidates!)assert.ok((item.title+' '+item.content).toLowerCase().includes(c.quote.toLowerCase()));
 const report=assessInterests({interestEvaluations:appraisals(context)},context,'ollama/fixture');assert.equal(report.status,'succeeded');assert.equal(report.evaluations[0].impact,10);assert.equal(context.interestBasis![0].score,49);assert.equal(report.evaluations[0].reference.versionId,'version');assert.ok(report.evaluations[0].reason.length>8);assert.equal(report.evaluations[0].classification,'opinion');assert.equal(report.evaluations[0].factCheckStatus,'unverified');
 assert.equal(assessInterests({interestEvaluations:appraisals(context).map(e=>({...e,theme:'artemis radiation'}))},context,'ollama/fixture').status,'succeeded');
});

for(const bad of [undefined,[],[{candidateId:'fabricated'}],'broken',null])test(`empty or malformed AI appraisal is not accepted: ${JSON.stringify(bad)}`,()=>{const r=assessInterests({interestEvaluations:bad},context,'ollama/fixture');assert.equal(r.status,'failed');assert.deepEqual(r.evaluations,[]);});

test('unknown memories, invalid numbers, inconsistent direction and missing targets reject the whole batch',()=>{
 for(const patch of [{impact:NaN},{impact:Infinity},{confidence:1.1},{impact:99},{impact:-3,direction:'strengthen'},{theme:'unseen invented topic'},{memoryIds:['fabricated']},{relatedInterestKeys:['unknown']}]){
  const values=appraisals(context);Object.assign(values[0],patch);assert.equal(assessInterests({interestEvaluations:values},context,'ollama/fixture').status,'failed',JSON.stringify(patch));
 }
 const forged={...context,interestCandidates:context.interestCandidates!.map(c=>({...c,quote:'This quotation does not exist.'}))};assert.equal(assessInterests({interestEvaluations:appraisals(context)},forged,'ollama/fixture').status,'failed');
});

async function fixture(mode:'positive'|'contextual'|'failure'|'empty'='positive'){
 await mkdir('tmp',{recursive:true});const root=await mkdtemp(path.resolve('tmp','interest-ai-')),database=path.join(root,'Memory','kousatsu.sqlite');await mkdir(path.dirname(database),{recursive:true});
 const sources=parseResearchSources({sources:['science','culture'].map(genre=>({id:genre,name:genre,genre,topic:item.title,feedUrl:`https://example.org/${genre}.xml`,enabled:true,contentPolicy:'metadata-and-feed-summary'}))});
 const settings={...agendaDefaults,initialScores:{science:49,culture:52},maxSources:1};
 const history=new TopicHistory(database),provider:KousatsuAiProvider={id:'ollama-fixture',model:'controlled-appraisal',analyze:c=>new DeterministicProvider().analyze(c),async proposeGrounded(c){
  if(mode==='failure')throw Error('SIMULATED_MODEL_TIMEOUT');
  return {observations:[],conclusions:[],hypotheses:[],reflection:{issue:'計測条件の違いをどの判断に生かすか。',position:'私は早期の適用より、計測条件をそろえることを優先する。',reasoning:'条件をそろえると、測定法の違いと対象の変化を分けて考えられるからである。',alternative:'運用条件を十分に再現していれば、実用へ進めることを重視する説明も成り立つ。',revisionCondition:'異なる条件でも同じ傾向が観測されれば適用を優先し、差が大きければ範囲を修正する。',premiseClaimIds:c.claims.slice(0,1).map(x=>x.id),assumptions:['計測条件の違いが解釈に影響し得ると仮定する。'],confidence:.5},interestEvaluations:mode==='empty'?[]:appraisals(c,mode==='contextual'&&c.items[0].title.includes('Beta')?-10:10)};
 }};
 const runtime=await ResearchRuntime.open({databasePath:database,outputDirectory:path.join(root,'Notes'),sources,providerForJob:jobId=>new ResearchEngine({jobId,database:runtime.database,history,provider,exploration:0})}),agenda=new ResearchAgenda(database,settings);agenda.reconcile(sources);
 const feed=(edition:number)=>`<rss version="2.0"><channel><title>isolated test</title><item><title>Artemis radiation shielding measurements series ${edition===1?'Alpha':'Beta'}</title><link>https://example.org/article-${edition}</link><description><![CDATA[Artemis radiation shielding measurements series ${edition===1?'Alpha':'Beta'} compare instrument calibration across controlled experiments. ${'Researchers compare measurement conditions and alternative explanations before applying laboratory observations to operational environments. '.repeat(5)}]]></description></item></channel></rss>`;
 const run=async(edition:number)=>{const collected=collectFeedXml(runtime.database,sources[0],feed(edition)),primary=runtime.database.getItem(collected.itemIds[0])!;const jobId=runtime.enqueueInput({source:sources[0],topic:item.title,articleRef:{itemId:primary.id,versionId:primary.versionId!}}),result=await runtime.tick({schedule:false,dailyMaxJobs:3});assert.equal(result.status,'completed',JSON.stringify(result));const analysis=runtime.database.getCheckpoint<AnalysisResult>(jobId,'analyze')!;agenda.reconcile(sources);return {jobId,analysis};};
 return {root,runtime,agenda,history,sources,settings,feed,run,close(){agenda.close();history.close();runtime.close();}};
}

test('AI appraisals persist reasons and change actual RSS choice, scan quota and the next inquiry',async()=>{
 const f=await fixture();try{
  assert.equal(f.agenda.plan('before','slot',f.sources,0).sources[0].id,'culture');
  const first=await f.run(1);assert.equal(first.analysis.research!.interests!.status,'succeeded');assert.equal(f.agenda.interests().find(i=>i.key==='genre:science')!.score,54);assert.equal(f.agenda.db.prepare('SELECT count(*) n FROM research_interest_appraisals').get()!.n,3);
  const op=parseWeeklyOperation({id:'ai-choice',startsAt:new Date(Date.now()-3600000).toISOString(),continuous:true,endsAt:null,maxArticles:1,runTimes:['06:00','18:00','22:00'],genres:['science','culture']});
  const config=parseAutonomousConfig({dataDirectory:f.root,sourcesPath:'unused',ai:{provider:'deterministic'},operation:op,exploration:0,agenda:f.settings});
  const calls:string[]=[];const future=Date.parse(new Date(Date.now()+86400000+9*3600000).toISOString().slice(0,10)+'T18:00:00+09:00');
  await planWeekly(config,f.runtime,f.sources,async url=>{calls.push(url);return {httpStatus:200,text:f.feed(2)};},future);
  assert.deepEqual(calls,['https://example.org/science.xml']);const row=f.agenda.db.prepare('SELECT input_json FROM jobs ORDER BY rowid DESC LIMIT 1').get()!,input=JSON.parse(String(row.input_json));assert.equal(input.source.id,'science');assert.equal(input.researchPlan.sourceBudget.candidateLimit,7);assert.equal(input.researchPlan.reason,'FOLLOW_UP_FROM_SAVED_QUESTION');
  const followed=await f.runtime.tick({schedule:false,dailyMaxJobs:3});assert.equal(followed.status,'completed');assert.ok('jobId' in followed);const next=f.runtime.database.getCheckpoint<AnalysisResult>(followed.jobId!,'analyze')!;assert.ok(next.research!.questions[0].includes('Beta'));assert.ok(!next.research!.questions[0].includes('「「'));assert.ok(next.research!.memories.length>0);
  assert.ok(f.agenda.db.prepare('SELECT evaluation_json FROM research_interest_appraisals').all().every(r=>JSON.parse(String(r.evaluation_json)).reason.length>8));
  f.agenda.db.prepare("UPDATE research_interests SET score=0 WHERE key='genre:culture'").run();assert.equal(f.agenda.plan('exploration','slot',f.sources,1,Date.now(),.99).explorationSource,'culture');
 }finally{f.close();}
});

test('reprocessing one article does not double-count appraisals or interest after reopening the store',async()=>{
 const f=await fixture();try{await f.run(1);const score=f.agenda.interests().find(i=>i.key==='genre:science')!.score;await f.run(1);const reopened=new ResearchAgenda(f.runtime.database.filePath,f.settings);try{reopened.reconcile(f.sources);assert.equal(reopened.interests().find(i=>i.key==='genre:science')!.score,score);assert.equal(reopened.db.prepare('SELECT count(*) n FROM research_interest_appraisals').get()!.n,3);assert.equal(reopened.db.prepare('SELECT count(*) n FROM research_interest_assessments WHERE applied=1').get()!.n,1);}finally{reopened.close();}}finally{f.close();}
});

test('the same terms can strengthen interest in one context and produce recorded aversion in another',async()=>{
 const f=await fixture('contextual');try{await f.run(1);const before=f.agenda.interests().find(i=>i.key==='genre:science')!.score;await f.run(2);assert.equal(f.agenda.interests().find(i=>i.key==='genre:science')!.score,before-5);assert.equal(f.agenda.db.prepare("SELECT count(*) n FROM research_interest_appraisals WHERE direction='aversion'").get()!.n,3);assert.ok(f.agenda.db.prepare("SELECT id FROM research_interest_events WHERE reason LIKE 'AI_%' AND score<previous_score").get());}finally{f.close();}
});

test('weekly decay is applied once and fresh source-bound AI discovery restores interest',async t=>{
 const start=Date.parse('2026-10-28T06:00:00+09:00');t.mock.timers.enable({apis:['Date'],now:start});const f=await fixture();try{await f.run(1);t.mock.timers.setTime(start+7*86400000);f.agenda.reconcile(f.sources);assert.equal(f.agenda.interests().find(i=>i.key==='genre:science')!.score,49);f.agenda.reconcile(f.sources);assert.equal(f.agenda.interests().find(i=>i.key==='genre:science')!.score,49);await f.run(2);assert.equal(f.agenda.interests().find(i=>i.key==='genre:science')!.score,54);}finally{f.close();}
});

for(const mode of ['failure','empty'] as const)test(`AI ${mode} is recorded without a fabricated appraisal or interest increase`,async()=>{
 const f=await fixture(mode);try{const result=await f.run(1);assert.equal(result.analysis.research!.interests!.status,'failed');assert.equal(f.agenda.interests().find(i=>i.key==='genre:science')!.score,49);assert.equal(f.agenda.db.prepare('SELECT count(*) n FROM research_interest_appraisals').get()!.n,0);assert.equal(f.agenda.db.prepare('SELECT status FROM research_interest_assessments').get()!.status,'failed');}finally{f.close();}
});

test('AI-driven interest remains within bounds and maximum interest expands the investigation budget',async()=>{
 const f=await fixture();try{f.agenda.db.prepare("UPDATE research_interests SET score=98 WHERE key='genre:science'").run();const before=f.agenda.plan('budget','before',f.sources,0);await f.run(1);const after=f.agenda.plan('budget','after',f.sources,0);assert.equal(after.sources[0].score,100);assert.equal(after.sources[0].candidateLimit,12);assert.ok(after.sources[0].candidateLimit>before.sources[0].candidateLimit);assert.equal(after.sources[0].bodyLimit,2);assert.ok(f.agenda.interests().every(i=>i.score>=0&&i.score<=100));}finally{f.close();}
});

test('new concepts retain an exploration opportunity when active themes are full, without deleting old values or history',async()=>{
 const f=await fixture();try{
  for(let i=0;i<50;i++)f.agenda.db.prepare("INSERT INTO research_interests VALUES(?,'theme',?,?,0,NULL,?)").run(`theme:old-${i}`,`old ${i}`,i,new Date().toISOString());
  const original=f.agenda.db.prepare("SELECT * FROM research_interests WHERE key='theme:old-0'").get();await f.run(1);
  assert.equal(f.agenda.interests().filter(i=>i.kind==='theme').length,50);assert.equal(f.agenda.db.prepare("SELECT count(*) n FROM research_interests WHERE kind='theme'").get()!.n,53);assert.deepEqual(f.agenda.db.prepare("SELECT * FROM research_interests WHERE key='theme:old-0'").get(),original);assert.equal(f.agenda.db.prepare('SELECT count(*) n FROM research_interest_activity WHERE active=0').get()!.n,3);assert.ok(f.agenda.interests().some(i=>i.label==='artemis radiation'));assert.equal(f.agenda.db.prepare('SELECT count(*) n FROM research_interest_appraisals WHERE applied=1').get()!.n,3);
 }finally{f.close();}
});
