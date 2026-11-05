import assert from 'node:assert/strict';
import test from 'node:test';
import {consistencyRequests,parseConsistencyReviews} from '../../src/lib/kousatsu/reflection-consistency';
import type {Reflection} from '../../src/lib/kousatsu/quality-types';

const reflection:Reflection={issue:'何を優先するか。',position:'私は理解を深めるため文脈説明の整備を優先したい。',reasoning:'説明が由来の理解に役立つという仮定に基づく。',
  alternative:'一方、説明を増やすと利用が減る可能性もある。',revisionCondition:'説明を付けても理解が高まらなければ、この見解を弱める。',
  premiseClaimIds:['claim'],assumptions:['説明は理解を深めると仮定する。'],confidence:.4,origin:'model',scope:'article'};
const requests=consistencyRequests([{id:'saved',reflection}]);
const rows=requests.map(r=>({id:r.id,verdict:'weakens',positionKind:'preference',reason:'見解の前提が成立しないという条件だから。'}));

test('diagnostics never certify a view, even when every model relation says weakens',()=>{
  const before=JSON.stringify(reflection),review=parseConsistencyReviews(requests,{reviews:rows});
  assert.equal(review.status,'advisory-only');assert.equal(review.semanticReview,'pending');assert.equal(review.independentVerification,'not-performed');
  assert.equal(review.requiresAttention,false);assert.equal(JSON.stringify(reflection),before);
  assert.equal(requests[0].target,'alternative');assert.equal(requests[1].target,'revision-condition');
});

test('support, coexistence and uncertainty are flagged for attention rather than accepted as counterconditions',()=>{
  for(const verdict of ['supports','compatible','unrelated','unclear']){
    const review=parseConsistencyReviews(requests,{reviews:[rows[0],{...rows[1],verdict}]});
    assert.equal(review.requiresAttention,true);assert.equal(review.semanticReview,'pending');
  }
});

test('duplicated, missing, foreign and malformed model review rows fail closed',()=>{
  assert.throws(()=>parseConsistencyReviews(requests,{reviews:[rows[0]]}),/INCOMPLETE/);
  for(const reviews of [[rows[0],rows[0]],[rows[0],{...rows[1],id:'foreign'}],[rows[0],{...rows[1],verdict:'passed'}],
    [rows[0],{...rows[1],positionKind:'fact-checked'}],[rows[0],{...rows[1],reason:''}]]){
    assert.throws(()=>parseConsistencyReviews(requests,{reviews}),/INVALID/);
  }
});

test('failed model placeholders and duplicate inputs cannot be diagnosed as valid views',()=>{
  assert.throws(()=>consistencyRequests([{id:'saved',reflection:{...reflection,origin:'rules'}}]),/MODEL_VIEW_REQUIRED/);
  assert.throws(()=>consistencyRequests([{id:'same',reflection},{id:'same',reflection}]),/INPUT_INVALID/);
});
