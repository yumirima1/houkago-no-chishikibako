import assert from 'node:assert/strict';
import test from 'node:test';
import {prematureEventInQuality} from '../../src/lib/kousatsu/future-event';
import {verifyArticle} from '../../src/lib/kousatsu/verify';
import type {QualityAnalysis} from '../../src/lib/kousatsu/quality-types';
import type {ArticleDraft} from '../../src/lib/kousatsu/types';
test('resumed saved drafts recheck future completion without rewriting the checkpoint',()=>{
 const quality={schema:2,generationStatus:'succeeded',evidenceReview:{summaryIssues:[]},coverage:[{fetchedAt:'2026-11-05T00:00:00Z'}],observations:[{claimId:'c',quote:'2026年11月15日にイベントを開催する予定です。'}],reflection:{issue:'何を重視するか。',position:'私は理解を重視したい。',reasoning:'2026年11月15日にイベントを実施した。',alternative:'一方、別の説明もあり得る。',revisionCondition:'理解の差がなければ優先順位を下げる。',premiseClaimIds:['c'],scope:'article'},modelIssues:[],conclusions:[],hypotheses:[]} as unknown as QualityAnalysis;
 const before=JSON.stringify(quality);
 assert(prematureEventInQuality(quality));
 const article={markdown:'',assertions:[],quality} as unknown as ArticleDraft;
 const result=verifyArticle({article,claims:[],items:[],evidence:[]});
 assert(result.issues.some(i=>i.code==='REFLECTION_EVENT_PREMATURE_COMPLETION'));
 assert.equal(JSON.stringify(quality),before);
 quality.reflection!.reasoning='2026年11月15日にイベントを開催する予定である。';
 assert(!prematureEventInQuality(quality));
});
