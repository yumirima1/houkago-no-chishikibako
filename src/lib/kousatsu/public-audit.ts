import type {DatabaseSync} from 'node:sqlite';
import type {AnalysisResult,StoredItem} from './types';
export type PublicDecision={articleId:string;kind:'published'|'exported'|'eligible'|'duplicate'|'legacy'|'conditions_not_met'|'verification_failed'|'publication_failed'|'incomplete';reason:string;duplicateOf:string|null;revisionOf?:string};
export function auditPublicArticles(db:DatabaseSync):PublicDecision[]{
  const exists=(name:string)=>Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(name));
  if(!exists('articles'))return [];
  const frozen=exists('public_documents')?db.prepare('SELECT article_id,news_json FROM public_documents ORDER BY created_at DESC').all():[];
  const deliveries=exists('public_delivery_checks')?db.prepare("SELECT notes_json,status FROM public_delivery_checks ORDER BY rowid DESC").all():[];
  const delivered=new Set(deliveries.filter(r=>r.status==='succeeded').flatMap(r=>JSON.parse(String(r.notes_json)) as string[]));
  const failed=new Set(deliveries.filter(r=>r.status==='failed').flatMap(r=>JSON.parse(String(r.notes_json)) as string[]));
  const transportFailed=exists('public_publish_state')&&db.prepare('SELECT status FROM public_publish_state ORDER BY rowid DESC LIMIT 1').get()?.status==='failed';
  const identities=new Map<string,string>();for(const f of frozen){const n=JSON.parse(String(f.news_json));if(!identities.has(n.id))identities.set(n.id,String(f.article_id));if(!identities.has(n.url))identities.set(n.url,String(f.article_id));}
  const rows=db.prepare(`SELECT a.id,j.status,j.input_json,c.data_json,s.data_json selected_json,v.data_json verification_json FROM articles a JOIN jobs j ON j.id=a.job_id LEFT JOIN checkpoints c ON c.job_id=a.job_id AND c.stage='analyze' LEFT JOIN checkpoints s ON s.job_id=a.job_id AND s.stage='selected-items' LEFT JOIN checkpoints v ON v.job_id=a.job_id AND v.stage='verify' ORDER BY a.created_at DESC,a.id`).all();
  return rows.map(row=>{
    const articleId=String(row.id),base={articleId,duplicateOf:null};
    if(delivered.has(articleId))return {...base,kind:'published' as const,reason:'PUBLIC_URL_CONTENT_VERIFIED'};
    if(failed.has(articleId))return {...base,kind:'publication_failed' as const,reason:'PUBLIC_URL_VERIFICATION_EXHAUSTED'};
    if(transportFailed&&frozen.some(f=>f.article_id===articleId))return {...base,kind:'publication_failed' as const,reason:'GIT_PUBLICATION_RETRIES_EXHAUSTED'};
    if(frozen.some(f=>f.article_id===articleId))return {...base,kind:'exported' as const,reason:'PUBLIC_PROJECTION_EXISTS; DELIVERY_NOT_YET_VERIFIED'};
    if(!row.data_json||!row.selected_json||!row.verification_json)return {...base,kind:'incomplete' as const,reason:'REQUIRED_CHECKPOINT_MISSING'};
    const a=JSON.parse(String(row.data_json)) as AnalysisResult,v=JSON.parse(String(row.verification_json));
    if(v.status!=='passed'||v.factCheckStatus==='contradicted')return {...base,kind:'verification_failed' as const,reason:'STRUCTURE_OR_REFERENCE_CHECK_FAILED'};
    if(!a.quality?.reflection)return {...base,kind:'legacy' as const,reason:'NO_STRUCTURED_REFLECTION_IN_ORIGINAL_RECORD'};
    const primary=(JSON.parse(String(row.selected_json)).items as StoredItem[]).find(i=>a.quality!.focusItemIds.includes(i.id));
    if(!primary||a.quality.status==='deferred'||!['succeeded','needs_review'].includes(String(row.status)))return {...base,kind:'conditions_not_met' as const,reason:'NO_ELIGIBLE_SOURCE_BOUND_VIEW'};
    const duplicateOf=identities.get(primary.id)??identities.get(primary.url);
    if(duplicateOf){
      const prior=rows.find(r=>r.id===duplicateOf),oldItems=prior?.selected_json?JSON.parse(String(prior.selected_json)).items as StoredItem[]:[];
      const old=oldItems.find(i=>i.id===primary.id||i.canonicalUrl===primary.canonicalUrl);
      const revision=JSON.parse(String(row.input_json)).researchPlan?.reason==='SOURCE_REVISION'&&old?.content&&primary.content&&old.versionId!==primary.versionId&&old.content.replace(/\s+/g,' ')!==primary.content.replace(/\s+/g,' ');
      if(revision)return {...base,kind:'eligible' as const,reason:'REVISED_SOURCE_VERSION_WITH_EXPLICIT_HISTORY',revisionOf:duplicateOf};
      return {...base,kind:'duplicate' as const,reason:'ALREADY_REPRESENTED_SOURCE_ARTICLE',duplicateOf};
    }
    identities.set(primary.id,articleId);identities.set(primary.url,articleId);
    return {...base,kind:'eligible' as const,reason:'STRUCTURED_VIEW_AND_REFERENCES_PASSED; FACTS_UNVERIFIED'};
  });
}
export function publicDecisionCounts(decisions:PublicDecision[]){return Object.fromEntries([...new Set(decisions.map(d=>d.kind))].sort().map(kind=>[kind,decisions.filter(d=>d.kind===kind).length]));}
