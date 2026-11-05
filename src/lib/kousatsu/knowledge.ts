import { KousatsuDatabase } from "./database";
import type { ClaimRecord, RelationRecord, StoredItem } from "./types";
import type { DocumentCoverage } from './quality-types';
import { compareRecords, meaningfulTerms } from './relevance';

function excerptFor(item: StoredItem) {
  return (item.summary || item.content || item.title).slice(0, 800);
}

function hasOpenQuotation(text:string){
  const closing:Record<string,string>={'「':'」','『':'』','“':'”'},stack:string[]=[];
  for(const character of text){
    if(closing[character])stack.push(closing[character]);
    else if(character===stack.at(-1))stack.pop();
  }
  return stack.length>0;
}

/** Retain original characters while joining abbreviations and punctuation
 * inside quoted titles, which are not independent source assertions. */
export function sourceSentences(text:string) {
  const sentences:string[]=[];
  for(const paragraph of text.split(/\n+/)) {
    let pending='';
    // Some pages concatenate adjacent text nodes as "away.This". Split without
    // inserting characters, so every resulting quote still matches the source.
    const parts=paragraph.split(/(?<=[.!?])(?=[A-Z“])/u).flatMap(chunk=>[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(chunk)]);
    for(let index=0;index<parts.length;index++) {
      const part=parts[index];
      pending+=part.segment;
      if(hasOpenQuotation(pending))continue;
      if(/[」』]$/.test(pending.trim())&&/^[をとがはでのにもへ]/.test(parts[index+1]?.segment.trimStart()??''))continue;
      if(/\b(?:St|No|Mr|Mrs|Ms|Dr|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|[A-Z])\.$/i.test(pending.trim()))continue;
      sentences.push(pending.trim());pending='';
    }
    if(pending.trim())sentences.push(pending.trim());
  }
  return sentences;
}

export function extractSourceClaims(
  database: KousatsuDatabase,
  items: StoredItem[],
  coverage?: DocumentCoverage[],
): ClaimRecord[] {
  const extracted=new Set<string>();
  // Re-reading the same immutable version must not reset reviewed judgments or
  // rewrite their timestamps. Explicit review updates still use upsertClaim.
  const existingClaimIds=new Map(database.listClaims(items.map(item=>item.id),{includeHistorical:true})
    .map(claim=>[JSON.stringify([claim.versionId,claim.text]),claim.id]));
  for (const item of items) {
    const body=coverage?.find(c=>c.itemId===item.id)?.kind==='article-body';
    const text = (body ? item.content : item.summary || item.content) || item.title;
    const candidates=body ? sourceSentences(text).filter(s=>s.length>=(/[\p{Script=Han}\p{Script=Katakana}]/u.test(s)?20:35) && s.length<=700 && s!==item.title && !/[?？]$/.test(s)&&
      !/^https?:\/\/\S+$/i.test(s)&&!/\bUTC\s*\([\d,]+\s*(?:KB|MB)\)|^(?:Subjects?:|Cite as:|Journal reference:|DOI:|arXiv:)/i.test(s))
      .map((s,index)=>({s,index,score:[...meaningfulTerms(item.title)].filter(w=>meaningfulTerms(s).has(w)).length +
        Math.min(2,(s.match(/\d[\d,.]*/g) ?? []).length)+(/\b(will|plans?|expected|scheduled|due in)\b/i.test(s)?1:0)+
        (/we (?:find|show)|results? (?:show|suggest|raise)|accuracy|outperform|below chance|more than half|実証|観測|結果|明らか|確認/.test(s)?3:0)}))
      .sort((a,b)=>b.score-a.score || a.index-b.index) : [];
    const mechanism=candidates.find(entry=>/share information|coordinate with|lets .*share/i.test(entry.s))??candidates.find(entry=>/coordinat|flow management|rather than|not be used|because|depends|adapt|interpret|preserv|archive|original|仕組み|機構|相互作用|由来|過程|原理/i.test(entry.s));
    const finding=candidates.find(entry=>/we (?:find|show)|results? (?:show|suggest|raise)|accuracy|outperform|below chance|more than half|実証|観測|明らか|確認/i.test(entry.s));
    const future=candidates.find(entry=>/\b(will|plans? to|planned|expected|due in)\b/i.test(entry.s));
    const chosen=[...new Map([...(finding?[finding]:[]),...(mechanism?[mechanism]:[]),...candidates.slice(0,1),...(future?[future]:[]),...candidates].map(entry=>[entry.s,entry])).values()].slice(0,4);
    const sentences=body ? chosen.sort((a,b)=>a.index-b.index).map(entry=>entry.s) : [text.slice(0,1200)];
    for(const sentence of sentences.length ? sentences : [text.slice(0,700)]) {
    const versionId=item.versionId??database.getItem(item.id)?.versionId;
    const key=JSON.stringify([versionId,sentence]);
    const claimId = existingClaimIds.get(key) ?? database.upsertClaim({
      classification: "source_claim",
      confidence: 0.5,
      itemId: item.id,
      versionId,
      reason:
        "RSS/Atom配信元が述べた内容であり、独立した出典による確認はまだ行っていません。",
      text: sentence,
    });
    existingClaimIds.set(key,claimId);
    extracted.add(claimId);
    database.upsertEvidence({
      claimId,
      excerpt: body ? sentence : excerptFor(item),
      itemId: item.id,
      versionId: item.versionId,
      locator: item.url,
      stance: "supports",
    });
    }
  }
  return database.listClaims(items.map((item) => item.id)).filter(claim=>!/^https?:\/\/\S+$/i.test(claim.text)&&
    (!coverage || claim.classification!=='source_claim' || extracted.has(claim.id)));
}

export function relateItems(
  database: KousatsuDatabase,
  items: StoredItem[],
  threshold = 0.08,
): RelationRecord[] {
  const selected=new Set<string>();
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex];
      const right = items[rightIndex];
      const { kind, score, reason } = compareRecords(left, right);
      if (score < threshold || !['same_document','follow_up_candidate','same_issue_candidate'].includes(kind)) continue;
      selected.add([left.id,right.id].sort().join(':'));

      database.upsertRelation({
        fromItemId: left.id,
        reason,
        relationType: "similar_topic",
        score,
        toItemId: right.id,
      });
    }
  }
  // Preserve historical rows, but never reuse an old, weak lexical match.
  return database.listRelations(items.map((item) => item.id)).filter(r=>selected.has([r.fromItemId,r.toItemId].sort().join(':')));
}
