import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ResearchAgenda,type AgendaSettings} from './research-agenda';
import {auditPublicArticles,publicDecisionCounts} from './public-audit';
import type {AutonomousConfig} from './autonomous-config';
import {autonomousPaths} from './autonomous-config';

export function readResearchSummary(file:string,settings?:AgendaSettings){
  if(!existsSync(file))return null;const db=new DatabaseSync(file,{readOnly:true});
  try{if(!db.prepare("SELECT name FROM sqlite_master WHERE name='research_interests'").get())return null;}
  finally{db.close();}
  const agenda=new ResearchAgenda(file,settings,{readOnly:true});try{
    const summary=agenda.summary();return {openInquiries:(summary.inquiryCounts.open??0)+(summary.inquiryCounts.selected??0),exhaustedInquiries:(summary.inquiryCounts.exhausted??0)+(summary.inquiryCounts.waiting_evidence??0),interestScores:agenda.interests().filter(i=>i.kind==='genre').map(i=>({genre:i.label,score:i.score})),lastSelection:summary.lastPlan?{sources:summary.lastPlan.sources.map(s=>({id:s.id,score:s.score,candidateLimit:s.candidateLimit}))}:null};
  }finally{agenda.close();}
}
/** A diagnostic read never creates a DB, migrates it, starts work, or advances a lease. */
export function inspectBackend(config:AutonomousConfig,now=Date.now()){
  const file=autonomousPaths(config).database;if(!existsSync(file))return {health:{status:'uninitialized'},counts:{},publication:[],planning:null};
  const db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA busy_timeout=5000');
  const has=(name:string)=>Boolean(db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(name));
  try{
    const counts=Object.fromEntries(['articles','items','item_versions','claims','evidence','relations','research_memory_events','research_memory_revisions','research_inquiries'].filter(has).map(t=>[t,Number(db.prepare(`SELECT count(*) n FROM ${t}`).get()?.n)]));
    const supervisor=has('autonomy_supervisor')?db.prepare('SELECT expires_at FROM autonomy_supervisor WHERE id=1').get():null;
    const cycles=has('autonomy_runs')?db.prepare('SELECT id,started_at,finished_at,status,details_json FROM autonomy_runs ORDER BY id DESC LIMIT 10').all().map(r=>({id:r.id,startedAt:r.started_at,finishedAt:r.finished_at,status:r.status,details:r.details_json?JSON.parse(String(r.details_json)):null})):[];
    const active=Boolean(supervisor&&String(supervisor.expires_at)>new Date(now).toISOString());
    const deadline=Math.max(240000,config.maxJobsPerCycle*(config.ai.timeoutMs+60000))+90000;
    const last=cycles[0],stalled=!!last&&last.status==='running'&&now-Date.parse(String(last.startedAt))>deadline;
    const publication=has('public_publish_state')?db.prepare('SELECT digest,status,attempts,error,commit_sha FROM public_publish_state ORDER BY rowid DESC LIMIT 5').all():[];
    const delivery=has('public_delivery_checks')?db.prepare('SELECT digest,status,attempts,error,expected_commit,deployed_commit,checked_at FROM public_delivery_checks ORDER BY rowid DESC LIMIT 5').all():[];
    const publicationHistory=has('public_attempt_events')?db.prepare('SELECT * FROM public_attempt_events ORDER BY id DESC LIMIT 20').all():[];
    const interestAppraisals=has('research_interest_appraisals')?db.prepare('SELECT job_id,term,impact,confidence,direction,evaluation_json,applied,created_at FROM research_interest_appraisals ORDER BY rowid DESC LIMIT 12').all():[];
    const decisions=auditPublicArticles(db);
    const unfinished=has('research_queue')?db.prepare("SELECT j.id,j.status,j.attempts,j.max_attempts,q.decision,q.next_attempt_at FROM research_queue q JOIN jobs j ON j.id=q.job_id WHERE q.decision<>'done' ORDER BY j.created_at LIMIT 50").all():[];
    const sourceHealth=has('fetch_runs')?db.prepare('SELECT s.id,s.name,f.status,f.completed_at,f.item_count,f.new_item_count FROM sources s LEFT JOIN fetch_runs f ON f.id=(SELECT id FROM fetch_runs WHERE source_id=s.id ORDER BY started_at DESC LIMIT 1)').all():[];
    let planning:unknown=null;if(has('research_interests')){const agenda=new ResearchAgenda(file,config.agenda,{readOnly:true});try{planning=agenda.summary();}finally{agenda.close();}}
    const health={status:stalled?'stalled':!active?'not-running':last?.status==='failed'||last?.status==='attention'||publication[0]?.status==='failed'||delivery[0]?.status==='failed'?'attention':'healthy',supervisorActive:active,lastCycleId:last?.id??null,lastCycleStatus:last?.status??null,readAt:new Date(now).toISOString()};
    return {health,counts,publication,delivery,publicationHistory,interestAppraisals,publicationCounts:publicDecisionCounts(decisions),publicationDecisions:decisions,unfinished,sourceHealth,planning,cycles};
  }finally{db.close();}
}
