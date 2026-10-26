import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,unlink} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {DeterministicProvider,type AnalysisContext} from '../../src/lib/kousatsu/ai';
import {createGroundedArticle} from '../../src/lib/kousatsu/article';
import {buildQualityAnalysis} from '../../src/lib/kousatsu/quality-analysis';
import {sourceSentences} from '../../src/lib/kousatsu/knowledge';
import {formReflection} from '../../src/lib/kousatsu/reflection';
import {verifyArticle} from '../../src/lib/kousatsu/verify';
import {parseAutonomousConfig} from '../../src/lib/kousatsu/autonomous-config';
import {ensureDataDirectories,exportKnowledge} from '../../src/lib/kousatsu/knowledge-export';
import {ResearchRuntime} from '../../src/lib/kousatsu/runtime-service';
import {ResearchEngine,TopicHistory} from '../../src/lib/kousatsu/research-engine';
import type {Reflection} from '../../src/lib/kousatsu/quality-types';
import type {MemoryContext} from '../../src/lib/kousatsu/runtime-types';

const item={id:'item',versionId:'version',sourceId:'fixture',title:'Stennis engine tests evaluate future flight conditions',url:'https://example.org/engine',canonicalUrl:'https://example.org/engine',fetchedAt:'2026-10-26T00:00:00Z',contentHash:'hash'};
const claim={id:'claim',itemId:item.id,versionId:item.versionId,text:item.title,classification:'source_claim' as const,confidence:.5,createdAt:item.fetchedAt,reason:'出典が述べた内容'};
const context:AnalysisContext={items:[item],claims:[claim],relations:[],topic:'科学',coverage:[{itemId:item.id,versionId:item.versionId,url:item.url,fetchedAt:item.fetchedAt,kind:'metadata',status:'available'}]};
const sound:Omit<Reflection,'origin'|'scope'>={issue:'試験をどの判断につなげることが重要か。',position:'私は成功の宣言よりも、設計の選択肢を減らす情報としての価値を重視する。',reasoning:'条件を絞った試験で何を確かめられたかを分けると、次に試すべき条件を選べるからである。',alternative:'運用条件を十分に再現していれば、運用への実証と見る説明も成り立つ。',revisionCondition:'別の条件でも同じ結果が得られれば評価を強め、差が大きければ適用範囲を修正する。',premiseClaimIds:['claim'],assumptions:['試験条件の違いが適用範囲に影響し得ると仮定した。'],confidence:.9};
const fields=['issue','position','reasoning','alternative','revisionCondition'] as const;
const quality=(c=context,proposal?:unknown)=>buildQualityAnalysis(c,'試験結果をどう評価するか。',c.items.map(i=>i.id),proposal);
function observation(c=context){return quality(c).observations;}
function memory(q=quality()):MemoryContext{return {id:'previous',jobId:'old-job',kind:'interpretation',topic:'科学',text:q.reflection!.position,reason:q.reflection!.reasoning,createdAt:item.fetchedAt,verificationStatus:'passed',factCheckStatus:'unverified',references:[{itemId:item.id,versionId:item.versionId,claimIds:['claim']}],quality:q};}

test('partial facts still yield an answer, rationale, competing explanation and a concrete revision condition',()=>{
 const q=quality();assert(q.reflection);for(const field of fields)assert(q.reflection[field].length>15);
 assert.equal(q.reflection.scope,'headline');assert(q.reflection.confidence<=.25);assert(q.reflection.position!==claim.text);
 const draft=createGroundedArticle({...context,analysis:{quality:q,summary:'ignored',hypotheses:[],provider:'fixture',model:'fixture'}});
 for(const label of ['重要な問題','私の見解（推論）','理由','別の説明','見解を変える条件'])assert(draft.markdown.includes(label));
 assert(!draft.markdown.includes('仮説の生成を保留した'));assert(draft.assertions.some(a=>a.classification==='inference'&&a.text===q.reflection!.position));
});

test('a Japanese opinion need not use a tentative keyword or repeat the source vocabulary',()=>{
 const p={...sound,position:'私はoption valueを重視する。成功の宣言よりも、次の選択の余地を確保したい。'};
 const formed=formReflection(context,observation(),{reflection:p});assert.equal(formed.reflection.origin,'model');assert.equal(formed.reflection.position,p.position);assert.deepEqual(formed.issues,[]);
});

test('a causal interpretation need not be written as a first-person preference',()=>{
 const c={...context,coverage:[{...context.coverage![0],kind:'feed-summary' as const}]};
 const position='主な制約は運用条件の違いにある可能性がある。';
 const formed=formReflection(c,observation(c),{reflection:{...sound,position}});assert.equal(formed.reflection.origin,'model');assert.equal(formed.reflection.position,position);
});

test('repairing an invalid main answer also aligns its dependent counterargument with the repaired view',()=>{
 const p={...sound,position:'情報不足のため判断できない。',alternative:'この情報不足そのものが唯一の問題という別の説明もある。'};
 const q=quality(context,{reflection:p});assert.notEqual(q.reflection!.position,p.position);assert.notEqual(q.reflection!.alternative,p.alternative);assert(q.reflection!.alternative.length>15);
});

test('an incomplete proposal is repaired while preserving a sound, specific position',()=>{
 const p={...sound,alternative:''};const formed=formReflection(context,observation(),{reflection:p});
 assert.equal(formed.reflection.position,p.position);assert(formed.reflection.alternative.length>15);assert(formed.issues.includes('REFLECTION_INCOMPLETE'));
});

test('a factual error in the reason is repaired without deleting a sound opinion',()=>{
 const formed=formReflection(context,observation(),{reflection:{...sound,reasoning:'試験で9000人に効果があったため、この見解を支持する。'}});
 assert(formed.issues.includes('REFLECTION_UNSOURCED_NUMBER'));assert.equal(formed.reflection.position,sound.position);assert(!formed.reflection.reasoning.includes('9000'));
});

test('a circular alternative and a condition that only reaffirms the view are repaired independently',()=>{
 const q=quality(context,{reflection:{...sound,alternative:sound.position,revisionCondition:'役に立つことが分かれば、この見解は役に立つと評価できる。'}});
 assert.equal(q.reflection!.position,sound.position);assert.notEqual(q.reflection!.alternative,sound.position);assert.notEqual(q.reflection!.revisionCondition,'役に立つことが分かれば、この見解は役に立つと評価できる。');
 assert(q.modelIssues.includes('REFLECTION_REPEATED_ALTERNATIVE'));assert(q.modelIssues.includes('REFLECTION_NONREVISING_CONDITION'));
});

test('mentioning another medium is not itself a condition for changing the view',()=>{
 const condition='作品が別の媒体へ移る場合に、原稿や著作権の問題が発生する可能性がある。';
 const q=quality(context,{reflection:{...sound,revisionCondition:condition}});assert(q.modelIssues.includes('REFLECTION_NONREVISING_CONDITION'));assert.notEqual(q.reflection!.revisionCondition,condition);assert.equal(q.reflection!.position,sound.position);
});

test('unfinished introductions and numbered consequences are repaired into complete arguments',()=>{
 for(const position of ['具体的には以下のようなトレードオフがあります:','以下のようなトレードオフがあると考えます。']){
  const q=quality(context,{reflection:{...sound,position,alternative:'2. 試験結果が低ければ、エンジンの性能を低下させることになる。'}});
  assert(q.modelIssues.includes('REFLECTION_FRAGMENT'));assert(q.modelIssues.includes('REFLECTION_NONALTERNATIVE'));assert(!q.reflection!.position.endsWith(':'));assert(!q.reflection!.alternative.startsWith('2.'));
 }
});

test('repeating the position verbatim cannot stand in for its reason',()=>{
 const q=quality(context,{reflection:{...sound,reasoning:sound.position}});assert(q.modelIssues.includes('REFLECTION_CIRCULAR_REASON'));assert.equal(q.reflection!.position,sound.position);assert.notEqual(q.reflection!.reasoning,sound.position);
});

test('describing useful data and future decisions is not by itself a distinct viewpoint',()=>{
 const position='試験結果は性能を向上させるための重要なデータである。これを利用すると設計判断がより良い結果を得られる。';
 const q=quality(context,{reflection:{...sound,position}});assert(q.modelIssues.includes('REFLECTION_NONANSWER'));assert.notEqual(q.reflection!.position,position);assert(q.reflection!.position.includes('私は'));
});

test('a factual preface is separated from the actual opinion without losing that opinion',()=>{
 const q=quality(context,{reflection:{...sound,position:`試験に関する資料です。${sound.position}`}});assert(q.modelIssues.includes('REFLECTION_FACT_PREFACE'));assert.equal(q.reflection!.position,sound.position);
});

test('a clearly hypothetical numeric condition is retained as an assumption rather than mistaken for a sourced fact',()=>{
 const position='仮に試験回数を2倍にできるなら、私は条件の多様化を優先する。';
 const formed=formReflection(context,observation(),{reflection:{...sound,position}});
 assert.equal(formed.reflection.origin,'model');assert.equal(formed.reflection.position,position);assert(formed.reflection.assumptions.some(a=>a.includes('思考実験')));
});

for(const bad of [undefined,null,{}, {reflection:{}}, {reflection:{...sound,premiseClaimIds:{id:'claim'}}}]) {
 test(`missing and malformed model answers never produce an empty reflection: ${JSON.stringify(bad)?.slice(0,45)}`,()=>{
  const q=quality(context,bad);for(const field of fields)assert(q.reflection![field].trim());
 });
}

test('a deferral-only position is repaired rather than accepted or used to cancel the note',()=>{
 const q=quality(context,{reflection:{...sound,position:'情報が不足しているため現時点では判断できない。'}});
 assert(q.modelIssues.includes('REFLECTION_DEFERRAL_ONLY'));assert(!q.reflection!.position.includes('判断できない'));assert(q.reflection!.revisionCondition);
});

for(const [field,value,issue] of [['position','私は9000人の改善を評価したい。','REFLECTION_UNSOURCED_NUMBER'],['reasoning','https://invented.invalid/ で確認できたからである。','REFLECTION_UNTRACKED_URL']] as const) {
 test(`unsupported factual details are repaired without removing the whole view: ${issue}`,()=>{
  const q=quality(context,{reflection:{...sound,[field]:value}});assert(q.modelIssues.includes(issue));assert(!q.reflection![field].includes(value));assert(q.reflection!.position.length>15);
 });
}

test('unknown source and memory IDs cannot become support for an opinion',()=>{
 for(const p of [{...sound,premiseClaimIds:['fabricated']},{...sound,memoryIds:['fabricated']}]){
  const q=quality(context,{reflection:p});assert(q.modelIssues.some(i=>/UNKNOWN/.test(i)));assert.deepEqual(q.reflection!.premiseClaimIds,['claim']);
 }
});

test('scientific, social and cultural records produce different issues and positions',()=>{
 const titles=[item.title,'Why planes circle: shared air traffic management plans','East of Eden: the novel becomes a television adaptation'];
 const views=titles.map(title=>quality({...context,items:[{...item,title}],claims:[{...claim,text:title}]}).reflection!);
 assert.equal(new Set(views.map(v=>v.position)).size,3);assert.equal(new Set(views.map(v=>v.revisionCondition)).size,3);
});

test('lack of any source yields a bounded research-policy view rather than invented observations',()=>{
 const q=quality({...context,items:[],claims:[],coverage:[]});assert.equal(q.observations.length,0);assert.equal(q.reflection!.scope,'no-source');assert(q.reflection!.position.length>15);assert.deepEqual(q.reflection!.premiseClaimIds,[]);
});

test('a view is never silently classified as a confirmed fact',()=>{
 const q=quality(),draft=createGroundedArticle({...context,analysis:{quality:q,summary:'ignored',hypotheses:[],provider:'fixture',model:'fixture'}});
 const inference=draft.assertions.find(a=>a.classification==='inference')!;inference.classification='confirmed_fact';
 assert(verifyArticle({...context,article:draft,evidence:[]}).issues.some(i=>i.code==='INFERENCE_MISCLASSIFIED_AS_FACT'));
});

test('headline-only analysis repairs invented empirical results while retaining a substantive opinion',()=>{
 const q=quality(context,{reflection:{...sound,position:'この試験では、性能と安全性に関する重要なデータが収集されました。',reasoning:'この試験により得られた手応えは安全性向上の基準となります。'}});
 assert(q.modelIssues.includes('REFLECTION_HEADLINE_AS_FACT'));assert(!q.reflection!.position.includes('収集されました'));assert(!q.reflection!.reasoning.includes('この試験により得られた'));
 assert(q.reflection!.position.length>15);assert(q.reflection!.revisionCondition.length>15);
});

test('asking whether to use a result and predicting confirmed requirements does not create a headline-based opinion',()=>{
 const position='この試験は設計判断へ移すべきかを決定するために重要なデータが必要です。その結果で要件が確認されます。';
 const q=quality(context,{reflection:{...sound,position}});assert(q.modelIssues.includes('REFLECTION_HEADLINE_AS_FACT'));assert.notEqual(q.reflection!.position,position);assert(q.reflection!.position.includes('私は'));
});

test('a possible consequence appended to an unsourced causal assertion does not turn it into a headline opinion',()=>{
 const position='試験結果はエンジンの安全性に直接影響します。その結果で判断は異なる可能性があります。';
 const q=quality(context,{reflection:{...sound,position}});assert(q.modelIssues.includes('REFLECTION_HEADLINE_AS_FACT'));assert.notEqual(q.reflection!.position,position);assert(q.reflection!.position.includes('私は'));
});

test('repairing an engine is not the same as revising a view',()=>{
 const revisionCondition='試験結果が悪化すれば問題点を修正して、次の設計判断に必要な準備を進める。';
 const q=quality(context,{reflection:{...sound,revisionCondition}});assert(q.modelIssues.includes('REFLECTION_NONREVISING_CONDITION'));assert.notEqual(q.reflection!.revisionCondition,revisionCondition);
});

test('new document versions revise the recorded view without treating the old opinion as evidence',()=>{
 const previous=memory(),copy=structuredClone(previous);
 const q=quality({...context,items:[{...item,versionId:'new'}],claims:[{...claim,versionId:'new'}],coverage:[{...context.coverage![0],versionId:'new'}],memories:[previous]});
 assert.equal(q.viewReviews![0].action,'revise');assert.deepEqual(previous,copy);assert.match(q.viewReviews![0].reason,/旧見解を事実として引き継がない/);
});

test('explicit opposing material withdraws adoption of the old view and remains visible',()=>{
 const c={...context,memories:[memory()],claims:[claim,{...claim,id:'counter',classification:'contradiction' as const,text:'The stated test did not cover the operational conditions.'}]};
 const q=quality(c);assert.equal(q.viewReviews![0].action,'withdraw');assert.equal(q.viewReviews![0].confidence,0);assert.deepEqual(q.reflection!.counterClaimIds,['counter']);
 const draft=createGroundedArticle({...c,analysis:{quality:q,summary:'ignored',hypotheses:[],provider:'fixture',model:'fixture'}});
 assert(draft.markdown.includes(c.claims[1].text));assert(draft.markdown.includes('**私の見解（推論）**'));
});

test('concatenated HTML text retains complete coordination evidence without altering quotes',()=>{
 const text='The fix starts before landing.This approach lets airports share information.The new rule is due in November.';
 const sentences=sourceSentences(text);assert.equal(sentences.length,3);for(const sentence of sentences)assert(text.includes(sentence));assert(sentences[1].includes('share information'));
});

for(const action of ['maintain','withdraw'] as const) {
 test(`view persistence and ${action} history survive restart, memory deduplication and missing Markdown`,async t=>{
  const dir=await mkdtemp(path.resolve('tmp/view-memory-'));
  const config=parseAutonomousConfig({dataDirectory:dir,sourcesPath:path.join(dir,'sources.json'),minFreeMiB:1,ai:{provider:'deterministic'}});
  const paths=await ensureDataDirectories(config),history=new TopicHistory(paths.database);
  let runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources:[],providerForJob:jobId=>new ResearchEngine({jobId,database:runtime.database,history,provider:new DeterministicProvider(),exploration:0})});
  t.after(async()=>{runtime.close();history.close();await rm(dir,{recursive:true,force:true});});
  const fixture=path.join(dir,'source.xml');await writeFile(fixture,`<rss version="2.0"><channel><title>fixture</title><item><title>${item.title}</title><link>${item.url}</link></item></channel></rss>`);
  const input={topic:'科学',fixturePath:fixture,source:{id:'fixture',name:'fixture',feedUrl:'https://example.org/rss',contentPolicy:'metadata-only' as const}};
  runtime.enqueueInput(input);assert.equal((await runtime.tick({schedule:false})).status,'completed');
  const old=runtime.store.retrieveMemories(input.topic)[0];assert(old.quality?.reflection);assert.equal(old.text,old.quality.reflection.position);assert.equal(JSON.parse(old.reason).confidence,old.quality.reflection.confidence);
  if(action==='withdraw')runtime.database.upsertClaim({classification:'contradiction',confidence:.5,itemId:old.references[0].itemId,versionId:old.references[0].versionId,text:'The operational interpretation is explicitly disputed.',reason:'隔離した反対材料'});
  const job=runtime.enqueueInput(input);assert.equal((await runtime.tick({schedule:false})).status,'completed');
  const sql=new DatabaseSync(paths.database,{readOnly:true});try{
   const q=JSON.parse(String(sql.prepare('SELECT quality_json FROM research_quality_reviews WHERE job_id=?').get(job)!.quality_json));assert.equal(q.viewReviews[0].action,action);
   assert.equal(sql.prepare('SELECT text FROM research_memory_events WHERE id=?').get(old.id)?.text,old.text);assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
   if(action==='maintain')assert.equal(sql.prepare('SELECT count(*) n FROM research_memory_events').get()?.n,1);
  }finally{sql.close();}
  assert.equal((await exportKnowledge(config,history)).conflicts.length,0);
  const file=path.join(paths.memory,`view-review-${old.id}-${job}.md`),text=await readFile(file,'utf8');assert(text.includes(action));await unlink(file);
  await exportKnowledge(config,history);assert.equal(await readFile(file,'utf8'),text);assert((await readdir(paths.memory)).some(f=>f.startsWith('view-')));
  runtime.close();runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources:[]});
  assert.equal(runtime.store.retrieveMemories(input.topic).some(m=>m.id===old.id),action==='maintain');
 });
}
