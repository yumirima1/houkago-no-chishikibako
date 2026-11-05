import assert from 'node:assert/strict';
import test from 'node:test';
import {prematurelyCompletedEvent} from '../../src/lib/kousatsu/future-event';
import {formReflection} from '../../src/lib/kousatsu/reflection';

const source='2026年11月15日、図書館は「知る！つくる！あそぶ！」イベントを開催します。';
const fetchedAt='2026-10-30T05:00:00Z',readAt=Date.parse(fetchedAt);

test('an explicitly future scheduled date cannot become a completed or ongoing event',()=>{
  for(const verb of ['実施した','開催した','開催された','実施している','開催している'])
    assert(prematurelyCompletedEvent(`資料は2026年11月15日にイベントを${verb}。`,source,readAt));
});

test('schedules, preparation, hypotheses, negation and discussion of errors are not completion assertions',()=>{
  for(const value of ['2026年11月15日にイベントを実施する予定である。','2026年11月15日に向けてイベントの準備を実施した。','もし2026年11月15日にイベントを実施した場合、結果を確認する。','2026年11月15日にイベントを実施しているとは限らない。','2026年11月15日にイベントを実施したという誤記がある。'])
    assert.equal(prematurelyCompletedEvent(value,source,readAt),false,value);
});

test('other years, the nearest prior date, later reading and timezone boundaries remain open',()=>{
  assert.equal(prematurelyCompletedEvent('2025年11月15日にイベントを実施した。',source,readAt),false);
  assert.equal(prematurelyCompletedEvent('2026年11月15日の催事に先立ち、2026年10月20日にイベントを実施した。',source,readAt),false);
  assert.equal(prematurelyCompletedEvent('2026年11月15日にイベントを実施した。',source,Date.parse('2026-11-16T00:00:00Z')),false);
  assert.equal(prematurelyCompletedEvent('2026年11月15日にイベントを実施した。',source,Date.parse('2026-11-14T12:00:00Z')),false);
});

test('missing dates, read time and invalid calendars cannot create an invented verdict',()=>{
  assert.equal(prematurelyCompletedEvent('11月15日にイベントを実施した。',source,readAt),false);
  assert.equal(prematurelyCompletedEvent('2026年11月15日にイベントを実施した。',source,NaN),false);
  assert.equal(prematurelyCompletedEvent('2026年11月31日にイベントを実施した。','2026年11月31日に開催予定。',readAt),false);
});

test('strict reflection validation rejects the premature assertion and retains a correctly scheduled account',()=>{
  const item={id:'doc',versionId:'version',sourceId:'library',title:'図書館の催事',url:'https://example.invalid/event',canonicalUrl:'https://example.invalid/event',content:source,contentHash:'fixture',fetchedAt};
  const context={topic:'図書館の催事',groundedRequest:true,items:[item],relations:[],claims:[{id:'claim',itemId:item.id,versionId:item.versionId,text:source,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:fetchedAt}]};
  const observations=[{claimId:'claim',itemId:item.id,versionId:item.versionId,quote:source,url:item.url,kind:'article-body' as const,confidence:'source-only' as const}];
  const reflection={issue:'催事を文化継承に生かすうえで何を確かめるべきか。',position:'私は、文化継承を目指すなら、体験後の理解度の確認を優先したい。',
    reasoning:'資料は2026年11月15日にイベントを実施している。',alternative:'一方、もし資料公開だけで理解が進むなら、公開を優先する説明も成り立つ。',
    revisionCondition:'もし体験後も理解が改善しないと観測されれば、体験の便益という前提が弱まるため、この見解の優先順位を下げる。',premiseClaimIds:['claim'],assumptions:['体験が理解に役立つと仮定する。'],confidence:.4};
  const rejected=formReflection(context,observations,{reflection});
  assert(rejected.issues.includes('REFLECTION_EVENT_PREMATURE_COMPLETION'));assert.equal(rejected.reflection.origin,'rules');
  const scheduled=formReflection(context,observations,{reflection:{...reflection,reasoning:'資料は2026年11月15日にイベントを開催する予定だと報告している。'}});
  assert.equal(scheduled.reflection.origin,'model');assert.deepEqual(scheduled.issues,[]);
});
