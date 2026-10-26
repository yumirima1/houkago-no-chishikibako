import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { AnalysisResult, PipelineInput, StoredItem } from "./types";
import type { MemoryContext, ResearchSnapshot, ResearchSource } from "./runtime-types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const timestamp = (milliseconds = Date.now()) => new Date(milliseconds).toISOString();
type Row = Record<string, string | number | null>;

/** Additive runtime tables in the same SQLite database as documents and notes. */
export class ResearchStore {
  private readonly db: DatabaseSync;

  constructor(filePath: string, options: { readOnly?: boolean } = {}) {
    this.db = new DatabaseSync(filePath,{readOnly:options.readOnly ?? false});
    try {
      this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
      if (options.readOnly) {
        const schema = this.db.prepare("SELECT version FROM research_schema").all() as Array<{version:number}>;
        if (schema.length!==1 || schema[0].version!==1) throw new Error("RUNTIME_SCHEMA_UNSUPPORTED");
        return;
      }
      this.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS research_schema(version INTEGER PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS research_queue(
            job_id TEXT PRIMARY KEY REFERENCES jobs(id), source_id TEXT NOT NULL,
            schedule_key TEXT UNIQUE, decision TEXT NOT NULL DEFAULT 'ready'
              CHECK(decision IN ('ready','done','blocked')),
            next_attempt_at TEXT NOT NULL, memory_json TEXT NOT NULL, source_config_json TEXT, error TEXT
          );
          CREATE TABLE IF NOT EXISTS research_schedules(
            source_id TEXT PRIMARY KEY, config_hash TEXT NOT NULL, next_run_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS research_worker(
            id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL,
            expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS research_memory_events(
            id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
            article_id TEXT NOT NULL REFERENCES articles(id), topic TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('interpretation','hypothesis')),
            text TEXT NOT NULL, reason TEXT NOT NULL, references_json TEXT NOT NULL,
            verification_status TEXT NOT NULL, fact_check_status TEXT NOT NULL,
            created_at TEXT NOT NULL, UNIQUE(job_id,kind,id)
          );
          CREATE TABLE IF NOT EXISTS research_ingested_jobs(
            job_id TEXT PRIMARY KEY REFERENCES jobs(id), article_id TEXT NOT NULL REFERENCES articles(id)
          );
          CREATE INDEX IF NOT EXISTS research_memory_topic ON research_memory_events(topic,created_at);
          CREATE TABLE IF NOT EXISTS research_memory_revisions(
            old_memory_id TEXT NOT NULL REFERENCES research_memory_events(id),
            new_job_id TEXT NOT NULL REFERENCES jobs(id), reason TEXT NOT NULL,
            created_at TEXT NOT NULL, PRIMARY KEY(old_memory_id,new_job_id)
          );
          CREATE TABLE IF NOT EXISTS research_memory_dedup(
            fingerprint TEXT PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES research_memory_events(id)
          );
          CREATE TABLE IF NOT EXISTS research_quality_reviews(job_id TEXT PRIMARY KEY REFERENCES jobs(id),quality_json TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS research_hypothesis_reviews(memory_id TEXT NOT NULL REFERENCES research_memory_events(id),
            job_id TEXT NOT NULL REFERENCES jobs(id),review_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(memory_id,job_id));
        `);
        const versions = this.db.prepare("SELECT version FROM research_schema").all() as Array<{version: number}>;
        if (versions.some((row) => row.version !== 1)) throw new Error("RUNTIME_SCHEMA_UNSUPPORTED");
        this.db.prepare("INSERT OR IGNORE INTO research_schema(version) VALUES(1)").run();
      });
    } catch (error) { this.db.close(); throw error; }
  }

  close() { this.db.close(); }

  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  acquireWorker(now = Date.now(), leaseMs = 30_000): string | null {
    return this.transaction(() => {
      const current = this.db.prepare("SELECT expires_at FROM research_worker WHERE id=1").get() as Row | undefined;
      if (current && String(current.expires_at) > timestamp(now)) return null;
      const token = randomUUID();
      this.db.prepare(`INSERT INTO research_worker(id,token,expires_at,last_seen_at) VALUES(1,?,?,?)
        ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at,last_seen_at=excluded.last_seen_at`)
        .run(token, timestamp(now + leaseMs), timestamp(now));
      return token;
    });
  }

  private assertWorker(token: string, now = Date.now()) {
    const worker = this.db.prepare("SELECT token,expires_at FROM research_worker WHERE id=1").get() as Row | undefined;
    if (!worker || worker.token !== token || String(worker.expires_at) <= timestamp(now)) throw new Error("RUNTIME_LEASE_LOST");
  }

  renewWorker(token: string, now = Date.now(), leaseMs = 30_000) {
    this.transaction(() => {
      this.assertWorker(token, now);
      this.db.prepare("UPDATE research_worker SET expires_at=?,last_seen_at=? WHERE id=1 AND token=?")
        .run(timestamp(now + leaseMs), timestamp(now), token);
    });
  }

  releaseWorker(token: string) {
    this.db.prepare("UPDATE research_worker SET expires_at=? WHERE id=1 AND token=?").run(timestamp(0), token);
  }

  private enqueueInside(input: PipelineInput, memories: MemoryContext[], key: string | null, now: number, sourceConfig: ResearchSource|null = null) {
    const id = randomUUID();
    this.db.prepare(`INSERT INTO jobs(id,type,status,input_json,max_attempts,created_at,updated_at)
      VALUES(?,'research_pipeline','pending',?,?,?,?)`)
      .run(id, JSON.stringify(input), input.maxAttempts ?? 3, timestamp(now), timestamp(now));
    this.db.prepare(`INSERT INTO research_queue(job_id,source_id,schedule_key,next_attempt_at,memory_json,source_config_json)
      VALUES(?,?,?,?,?,?)`).run(id,input.source.id,key,timestamp(now),JSON.stringify(memories),sourceConfig ? JSON.stringify(sourceConfig) : null);
    return id;
  }

  enqueue(input: PipelineInput, now = Date.now(), sourceConfig: ResearchSource|null = null) {
    return this.transaction(() => this.enqueueInside(input, this.retrieveMemories(input.topic), null, now,sourceConfig));
  }

  /** Durable scheduler outbox: a crash between queue creation and receipt is safe. */
  enqueueOnce(input:PipelineInput,key:string,sourceConfig:ResearchSource,now=Date.now()) {
    return this.transaction(()=>{
      const old=this.db.prepare('SELECT job_id FROM research_queue WHERE schedule_key=?').get(key);
      return old ? String(old.job_id) : this.enqueueInside(input,this.retrieveMemories(input.topic),key,now,sourceConfig);
    });
  }

  schedule(sources: ResearchSource[], outputDirectory: string, token: string, now = Date.now(), maxJobs = Infinity) {
    return this.transaction(() => {
      this.assertWorker(token,now);
      const created: string[] = [];
      for (const source of sources.filter((entry) => entry.enabled)) {
        if (created.length >= maxJobs) break;
        const configHash = hash(JSON.stringify(source));
        const current = this.db.prepare("SELECT config_hash,next_run_at FROM research_schedules WHERE source_id=?")
          .get(source.id) as Row | undefined;
        const due = current?.config_hash === configHash ? String(current.next_run_at) : timestamp(now);
        if (due > timestamp(now)) continue;
        // A blocked job requires a visible operator decision rather than an endless failure queue.
        const unfinished = this.db.prepare("SELECT job_id FROM research_queue WHERE source_id=? AND decision!='done' LIMIT 1")
          .get(source.id);
        if (unfinished) continue;
        const input = { source, topic: source.topic, outputDirectory } satisfies PipelineInput;
        created.push(this.enqueueInside(input,this.retrieveMemories(source.topic),`${source.id}:${configHash}:${due}`,now,source));
        this.db.prepare(`INSERT INTO research_schedules(source_id,config_hash,next_run_at) VALUES(?,?,?)
          ON CONFLICT(source_id) DO UPDATE SET config_hash=excluded.config_hash,next_run_at=excluded.next_run_at`)
          .run(source.id,configHash,timestamp(now + source.intervalMinutes * 60_000));
      }
      return created;
    });
  }

  nextJob(now = Date.now()): { jobId: string; memories: MemoryContext[]; sourceConfig: ResearchSource|null } | null {
    const row = this.db.prepare(`SELECT q.job_id,q.memory_json,q.source_config_json FROM research_queue q JOIN jobs j ON j.id=q.job_id
      WHERE q.decision='ready' AND q.next_attempt_at<=? ORDER BY j.created_at,j.id LIMIT 1`)
      .get(timestamp(now)) as Row | undefined;
    return row ? {jobId:String(row.job_id),memories:JSON.parse(String(row.memory_json)),sourceConfig:row.source_config_json ? JSON.parse(String(row.source_config_json)) : null} : null;
  }

  defer(jobId: string, error: string, blocked: boolean, token: string, now = Date.now()) {
    this.transaction(() => {
      this.assertWorker(token,now);
      this.db.prepare("UPDATE research_queue SET decision=?,error=?,next_attempt_at=? WHERE job_id=?")
        .run(blocked ? "blocked" : "ready",error,timestamp(now + 60_000),jobId);
    });
  }

  /** An operator may retry; changed input must be submitted as a separate new job. */
  retry(jobId: string) {
    this.transaction(() => {
      const row = this.db.prepare("SELECT status,attempts,max_attempts FROM jobs WHERE id=?").get(jobId) as Row | undefined;
      if (!row || row.status === "running" || row.status === "failed" || row.status === "cancelled" ||
          (Number(row.attempts) >= Number(row.max_attempts) && row.status !== "succeeded" && row.status !== "needs_review")) {
        throw new Error("JOB_NOT_RETRYABLE: create a new job after reviewing the error.");
      }
      const result = this.db.prepare("UPDATE research_queue SET decision='ready',next_attempt_at=?,error=NULL WHERE job_id=?")
        .run(timestamp(),jobId);
      if (!result.changes) throw new Error("QUEUE_JOB_NOT_FOUND");
    });
  }

  cancel(jobId: string) {
    this.transaction(()=>{
      const job=this.db.prepare(`SELECT j.status,l.expires_at FROM jobs j LEFT JOIN job_leases l ON l.job_id=j.id WHERE j.id=?`).get(jobId) as Row|undefined;
      if (!job || job.status==='running' || (job.expires_at && String(job.expires_at)>timestamp())) throw new Error('JOB_NOT_CANCELLABLE');
      const changed=this.db.prepare("UPDATE research_queue SET decision='done' WHERE job_id=? AND decision!='done'").run(jobId);
      if (!changed.changes) throw new Error('QUEUE_JOB_NOT_FOUND');
      // Completed historical notes remain completed. Cancellation never deletes their data.
      if (!['succeeded','needs_review'].includes(String(job.status))) {
        this.db.prepare("UPDATE jobs SET status='cancelled',updated_at=?,finished_at=? WHERE id=?").run(timestamp(),timestamp(),jobId);
      }
    });
  }

  complete(jobId: string, token: string) {
    this.transaction(() => {
      this.assertWorker(token);
      const job = this.db.prepare("SELECT status,input_json FROM jobs WHERE id=?").get(jobId) as Row | undefined;
      if (!job || !['succeeded','needs_review'].includes(String(job.status))) throw new Error("JOB_NOT_COMPLETE");
      const article = this.db.prepare("SELECT id FROM articles WHERE job_id=? ORDER BY created_at,id LIMIT 1").get(jobId) as Row | undefined;
      const analysis = this.checkpoint<AnalysisResult>(jobId,"analyze");
      const selected = this.checkpoint<{items: StoredItem[]}>(jobId,"selected-items");
      const classified = this.checkpoint<{claims: Array<{id: string;itemId: string;versionId?: string}>}>(jobId,"classify");
      const verification = this.checkpoint<import('./types').VerificationReport>(jobId,"verify");
      if (!article || !analysis || !selected || !classified || !verification) throw new Error("MEMORY_CHECKPOINT_INCOMPLETE");
      if (!this.db.prepare("SELECT job_id FROM research_ingested_jobs WHERE job_id=?").get(jobId)) {
        if(analysis.quality) {
          this.db.prepare('INSERT OR IGNORE INTO research_quality_reviews VALUES(?,?)').run(jobId,JSON.stringify(analysis.quality));
          for(const review of analysis.quality.hypothesisReviews ?? []) this.db.prepare('INSERT OR IGNORE INTO research_hypothesis_reviews VALUES(?,?,?,?)')
            .run(review.memoryId,jobId,JSON.stringify(review),timestamp());
        }
        const input = JSON.parse(String(job.input_json)) as PipelineInput;
        const references = selected.items.filter(item=>!analysis.quality || analysis.quality.focusItemIds.includes(item.id)).map((item) => {
          if (!item.versionId || !this.db.prepare("SELECT id FROM item_versions WHERE id=? AND item_id=?").get(item.versionId,item.id)) {
            throw new Error("MEMORY_VERSION_MISSING");
          }
          return {itemId:item.id,versionId:item.versionId,claimIds:classified.claims.filter((claim) => claim.itemId===item.id && claim.versionId===item.versionId).map((claim)=>claim.id)};
        });
        const events = [
          {kind:"interpretation",text:analysis.quality?.reflection?.position ?? analysis.summary,
            reason:analysis.quality?.reflection ? JSON.stringify({reasoning:analysis.quality.reflection.reasoning,confidence:analysis.quality.reflection.confidence,
              alternative:analysis.quality.reflection.alternative,revisionCondition:analysis.quality.reflection.revisionCondition,
              assumptions:analysis.quality.reflection.assumptions,classification:'inference',independentVerification:'not-performed'}) : `${analysis.provider}/${analysis.model}; 独立した事実確認は未実施`},
          ...analysis.hypotheses.map((entry)=>({kind:"hypothesis",text:entry.text,reason:entry.rationale})),
        ];
        events.forEach((event,index) => {
          const fingerprint=hash(JSON.stringify({kind:event.kind,text:event.text.normalize('NFKC').trim(),
            references:references.map(r=>`${r.itemId}:${r.versionId}`).sort()}));
          if (analysis.research && this.db.prepare('SELECT memory_id FROM research_memory_dedup WHERE fingerprint=?').get(fingerprint)) return;
          this.db.prepare(`INSERT INTO research_memory_events(id,job_id,article_id,topic,kind,text,reason,references_json,verification_status,fact_check_status,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(hash(`${jobId}:${index}`),jobId,String(article.id),input.topic,event.kind,event.text,event.reason,JSON.stringify(references),
              verification.status,verification.factCheckStatus ?? 'unverified',timestamp());
          if (analysis.research) this.db.prepare('INSERT INTO research_memory_dedup VALUES(?,?)').run(fingerprint,hash(`${jobId}:${index}`));
        });
        // Preserve the previous interpretation verbatim. Changed source versions
        // invalidate its context, not necessarily the hypothesis itself.
        const pinned = this.db.prepare('SELECT memory_json FROM research_queue WHERE job_id=?').get(jobId) as Row;
        const previous = JSON.parse(String(pinned.memory_json)) as MemoryContext[];
        for(const review of analysis.quality?.viewReviews??[])if(review.action==='withdraw') {
          this.db.prepare('INSERT OR IGNORE INTO research_memory_revisions(old_memory_id,new_job_id,reason,created_at) VALUES(?,?,?,?)')
            .run(review.memoryId,jobId,review.reason,timestamp());
        }
        for (const memory of previous) {
          const changes = memory.references.flatMap(old => references.filter(current =>
            old.itemId === current.itemId && old.versionId !== current.versionId)
            .map(current => `${old.itemId}: ${old.versionId} -> ${current.versionId}`));
          if (changes.length) this.db.prepare(`INSERT OR IGNORE INTO research_memory_revisions
            (old_memory_id,new_job_id,reason,created_at) VALUES(?,?,?,?)`).run(memory.id,jobId,
              `根拠文書の改訂による再評価。旧判断の誤り・反証成立は未確認。${changes.join('; ')}`,timestamp());
        }
        this.db.prepare("INSERT INTO research_ingested_jobs(job_id,article_id) VALUES(?,?)").run(jobId,String(article.id));
      }
      this.db.prepare("UPDATE research_queue SET decision='done',error=NULL WHERE job_id=?").run(jobId);
    });
  }

  private checkpoint<T>(jobId: string, stage: string): T | null {
    const row = this.db.prepare("SELECT data_json FROM checkpoints WHERE job_id=? AND stage=? AND status='succeeded'").get(jobId,stage) as Row | undefined;
    return row ? JSON.parse(String(row.data_json)) as T : null;
  }

  retrieveMemories(topic: string, limit = 8): MemoryContext[] {
    const normalized = topic.normalize("NFKC").toLowerCase().trim();
    const tokens = [...new Set(normalized.split(/\s+/).filter(Boolean))];
    const patterns = tokens.map((token)=>`%${token.replace(/[\\%_]/g,'\\$&')}%`);
    // Search the full history before limiting candidates; unrelated recent events
    // must not evict an older matching interpretation from long-term retrieval.
    const rows = this.db.prepare(`SELECT * FROM research_memory_events
      WHERE verification_status='passed' AND fact_check_status='unverified' AND
        NOT EXISTS(SELECT 1 FROM checkpoints c WHERE c.job_id=research_memory_events.job_id AND c.stage='analyze'
          AND json_extract(c.data_json,'$.research') IS NOT NULL AND json_extract(c.data_json,'$.quality') IS NULL) AND
        NOT EXISTS(SELECT 1 FROM research_memory_revisions r WHERE r.old_memory_id=research_memory_events.id) AND
        (lower(topic)=? ${patterns.map(()=>"OR lower(topic) LIKE ? ESCAPE '\\' OR lower(text) LIKE ? ESCAPE '\\'").join(' ')})
      ORDER BY CASE WHEN lower(topic)=? THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 200`)
      .all(normalized,...patterns.flatMap((pattern)=>[pattern,pattern]),normalized) as Row[];
    const all = rows.map((row)=>this.toMemory(row));
    return all.map((memory,index) => ({memory,score:
      (memory.topic.normalize("NFKC").toLowerCase() === normalized ? 10 : 0) +
      tokens.filter((token)=>`${memory.topic} ${memory.text}`.toLowerCase().includes(token)).length + 1/(index+1)}))
      .filter(({score})=>score>1).sort((a,b)=>b.score-a.score).slice(0,limit).map(({memory})=>memory);
  }

  private recentMemories(limit: number): MemoryContext[] {
    return (this.db.prepare("SELECT * FROM research_memory_events ORDER BY created_at DESC,id DESC LIMIT ?").all(limit) as Row[])
      .map((row)=>this.toMemory(row));
  }

  private toMemory(row: Row): MemoryContext {
    const quality=this.checkpoint<AnalysisResult>(String(row.job_id),'analyze')?.quality;
    return {id:String(row.id),jobId:String(row.job_id),topic:String(row.topic),text:String(row.text),reason:String(row.reason),
      createdAt:String(row.created_at),kind:row.kind as MemoryContext['kind'],references:JSON.parse(String(row.references_json)),
      verificationStatus:row.verification_status as MemoryContext['verificationStatus'],factCheckStatus:row.fact_check_status as MemoryContext['factCheckStatus'],...(quality ? {quality} : {})};
  }

  snapshot(sources: ResearchSource[], now = Date.now()): ResearchSnapshot {
    const worker = this.db.prepare("SELECT expires_at,last_seen_at FROM research_worker WHERE id=1").get() as Row | undefined;
    const jobs = this.db.prepare(`SELECT j.*,q.decision,q.error AS queue_error FROM jobs j
      LEFT JOIN research_queue q ON q.job_id=j.id ORDER BY j.created_at DESC,j.id DESC LIMIT 30`).all() as Row[];
    const notes = this.db.prepare("SELECT * FROM articles ORDER BY created_at DESC,id DESC LIMIT 50").all() as Row[];
    const topics = this.db.prepare(`SELECT topic,count(*) AS observations,max(created_at) AS last_seen_at
      FROM research_memory_events WHERE kind='interpretation' GROUP BY topic`).all() as Row[];
    return {
      initialized:true, sources,worker:{active:Boolean(worker && String(worker.expires_at)>timestamp(now)),lastSeenAt:worker ? String(worker.last_seen_at) : null},
      jobs:jobs.map((row)=>({id:String(row.id),topic:(JSON.parse(String(row.input_json)) as PipelineInput).topic,
        status:row.status as ResearchSnapshot['jobs'][number]['status'],stage:row.current_stage as string|null,
        error:(row.queue_error ?? row.last_error) as string|null,queue:row.decision as string|null,createdAt:String(row.created_at)})),
      notes:notes.map((row)=>({id:String(row.id),jobId:String(row.job_id),title:String(row.title),createdAt:String(row.created_at),
        status:String(row.status),provider:String(row.provider),model:String(row.model),published:row.output_path!==null})),
      memories:this.recentMemories(40),
      interests:topics.map((row)=>({topic:String(row.topic),observations:Number(row.observations),lastSeenAt:String(row.last_seen_at),
        score:Number(row.observations)*Math.exp(-Math.max(0,now-Date.parse(String(row.last_seen_at)))/(30*86400_000))}))
        .sort((a,b)=>b.score-a.score).slice(0,20),
    };
  }

  readNote(id: string) {
    const row = this.db.prepare("SELECT * FROM articles WHERE id=?").get(id) as Row | undefined;
    if (!row) return null;
    return {id:String(row.id),title:String(row.title),markdown:String(row.markdown),status:String(row.status),
      outputPath:row.output_path as string|null,verification:this.checkpoint<import('./types').VerificationReport>(String(row.job_id),"verify")};
  }
}
