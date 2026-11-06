import test from 'node:test';
import assert from 'node:assert/strict';
import {publicEvidence,appendPublicEvidence,isEvidenceOnlyAppend,publicSourceWarnings,sourceFragments} from '../../src/lib/kousatsu/public-evidence';
import {assertPublicSafety} from '../../src/lib/kousatsu/public-projection';
import type {GroundedObservation,QualityAnalysis} from '../../src/lib/kousatsu/quality-types';

const observations:GroundedObservation[]=['The plumes become easier to see in backlight.','A connection to an ocean is described as likely.','The surface is described as reflective.'].map((quote,i)=>({claimId:`claim-${i+1}`,itemId:'document',versionId:'version',quote,url:'https://example.org/source',kind:'article-body',confidence:'source-only'}));
const record=(id:string)=>{const o=observations.find(o=>o.claimId===id);return o?{text:o.quote,itemId:o.itemId,versionId:o.versionId,sourceId:'official',url:o.url}:null;};

test('long source excerpts retain the modal and final subject without inventing quotations',()=>{
 const quote='The bright plumes seen here extending from the south polar region of this small icy moon are likely connected to a subsurface ocean of liquid water.';
 const parts=sourceFragments(quote,'Enceladus in Backlight');assert(parts.join(' ').includes('likely'));assert(parts.join(' ').includes('ocean'));
 for(const part of parts)assert(quote.includes(part));
 const late='These are several introductory words about the image and its geometry before the important detail at the end which may change.';
 assert.doesNotThrow(()=>sourceFragments(late));assert(sourceFragments(late).join(' ').includes('may'));
 const dated='One image with many different visible details and a bright crescent at the edge shows Enceladus and was recorded in January of 2009.';
 const dateParts=sourceFragments(dated,'Enceladus in Backlight');assert(dateParts.join(' ').includes('Enceladus'));assert(dateParts.join(' ').includes('January of 2009'));
});

test('every public E label maps to its real claim, document, version, URL and quotation excerpt',()=>{
 const evidence=publicEvidence(observations,record);assert.deepEqual(evidence.unavailable,[]);assert.deepEqual(evidence.entries.map(e=>e.label),['E1','E2','E3']);
 for(const entry of evidence.entries){const original=observations.find(o=>o.claimId===entry.claimId)!;assert(original.quote.includes(entry.quoteExcerpt));assert.equal(entry.versionId,original.versionId);assert.equal(entry.url,original.url);assert.equal(entry.sourceId,'official');}
});
test('missing records, a wrong version and a different URL are never repaired by inventing evidence',()=>{
 assert.deepEqual(publicEvidence(observations,()=>null).unavailable,['E1','E2','E3']);
 for(const replacement of [{versionId:'wrong'},{url:'https://example.org/other'}]){const e=publicEvidence(observations,id=>({...record(id)!,...replacement}));assert.equal(e.entries.length,0);}
});
test('public source excerpts cannot disclose credentials or private file locations',()=>{
 const obs={...observations[0],quote:'A private configuration uses password=private-value in D:/AI/private/settings.'};
 const evidence=publicEvidence([obs],()=>({text:obs.quote,itemId:obs.itemId,versionId:obs.versionId}));assert.equal(evidence.entries.length,0);
 const projection=appendPublicEvidence('元の公開済み考察。',evidence);assert(!projection.includes('private-value'));assertPublicSafety({projection});
});
test('the appendix preserves the entire original public prose and refuses duplication',()=>{
 const evidence=publicEvidence(observations,record),original='# 元の考察\n不確実性と別の説明を保持する。';
 const next=appendPublicEvidence(original,evidence);assert(next.startsWith(original));assert(isEvidenceOnlyAppend(original,next));assert(next.includes('**E3**'));assert(next.includes('claim-3'));
 assert.throws(()=>appendPublicEvidence(next,evidence),/PUBLIC_EVIDENCE_DUPLICATE/);assert.equal(isEvidenceOnlyAppend(original,'改稿'+next),false);
});
test('metadata-only evidence is explicitly distinguished from an article body',()=>{
 const evidence=publicEvidence([{...observations[0],kind:'metadata'}],record);assert(appendPublicEvidence('元の考察。',evidence).includes('取得範囲: 題名・URL'));
});
test('a new date warning supplements a saved error without overwriting or silently correcting it',()=>{
 const q={observations:[{claimId:'c',quote:'One image was recorded in January of 2009.'}],evidenceReview:{summaries:[{facts:[{claimId:'c',text:'2009年1月1日の画像である。'}]}]}} as QualityAnalysis;
 const warnings=publicSourceWarnings(q),original='保存された誤読も履歴として保全する。';assert(warnings.some(w=>w.includes('日付')));
 const projection=appendPublicEvidence(original,{entries:[],unavailable:[]},warnings);assert(projection.startsWith(original));assert(projection.includes('要確認・保存後の出典再検査で問題を検出'));
});
