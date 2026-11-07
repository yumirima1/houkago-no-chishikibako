import test from 'node:test';import assert from 'node:assert/strict';import {pinnedComparisonSources,verifySourceBindings} from '../../src/lib/kousatsu/source-verification';import {buildQualityAnalysis} from '../../src/lib/kousatsu/quality-analysis';import type {StoredItem} from '../../src/lib/kousatsu/types';
const item=(id:string,title:string,content='A reusable flight research aircraft supports experimental flight tests.'):StoredItem=>({id,versionId:'v-'+id,sourceId:'source',title,content,url:`https://example.org/${id}`,canonicalUrl:`https://example.org/${id}`,contentHash:id,fetchedAt:'2026-11-07T00:00:00Z'});
test('source comparisons use only selected or explicitly tracked immutable candidates and never the wider search',()=>{
 const primary=item('primary','Reusable experimental flight research aircraft'),tracked=item('tracked','Reusable experimental flight research aircraft update'),untracked=item('untracked','Reusable experimental flight research center director');
 const context={items:[primary],claims:[{id:'claim',itemId:primary.id,versionId:primary.versionId,text:primary.content!,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:primary.fetchedAt}],relations:[],topic:'飛行研究'},q=buildQualityAnalysis(context,context.topic,[primary.id]);
 const old=verifySourceBindings(context,q,[primary,tracked,untracked]);assert(old.claims.some(c=>c.comparisons.some(p=>p.itemId===untracked.id)));
 const pinned=pinnedComparisonSources([primary],[{itemId:tracked.id,versionId:tracked.versionId!,url:tracked.url}],id=>id===tracked.versionId?tracked:null),next=verifySourceBindings(context,q,pinned);
 assert.deepEqual(pinned.map(i=>i.id),[primary.id,tracked.id]);assert(next.claims.some(c=>c.comparisons.some(p=>p.itemId===tracked.id)));assert(next.claims.every(c=>c.comparisons.every(p=>p.itemId!==untracked.id)));
});
test('a missing version or a mismatched item, version or URL cannot whitelist a candidate reference',()=>{
 const primary=item('primary','Flight research'),peer=item('peer','Flight research update'),candidate={itemId:peer.id,versionId:peer.versionId!,url:peer.url};
 for(const read of [()=>null,()=>({...peer,id:'other'}),()=>({...peer,versionId:'other'}),()=>({...peer,url:'https://example.org/forged'})])assert.deepEqual(pinnedComparisonSources([primary],[candidate],read),[primary]);
 assert.deepEqual(pinnedComparisonSources([primary],[candidate,candidate],()=>peer),[primary,peer]);
});
