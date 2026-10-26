import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { createAiProviderFromEnvironment, type KousatsuAiProvider } from "./ai";
import { KousatsuDatabase } from "./database";
import { KousatsuPipeline } from "./pipeline";
import { ResearchStore } from "./runtime-store";
import { loadResearchSources, runtimePaths } from "./runtime-config";
import type { MemoryContext, ResearchNote, ResearchSnapshot, ResearchSource } from "./runtime-types";
import type { PipelineInput } from "./types";

type RuntimeOptions = {
  databasePath?: string;
  outputDirectory?: string;
  sources?: ResearchSource[];
  provider?: KousatsuAiProvider;
  providerForJob?: (jobId: string) => KousatsuAiProvider;
};

function withMemory(provider: KousatsuAiProvider, memories: MemoryContext[]): KousatsuAiProvider {
  const frozen = structuredClone(memories);
  return {
    id:provider.id,model:provider.model,
    configurationFingerprint:createHash("sha256").update(JSON.stringify({
      base:provider.configurationFingerprint ?? null,memories:frozen,wrapper:1,
    })).digest("hex"),
    analyze:(context)=>provider.analyze({...context,memories:structuredClone(frozen)}),
  };
}

/** Before the first runtime migration, preserve an existing database using SQLite's online backup. */
async function preserveBeforeRuntime(filePath: string) {
  if (!existsSync(/* turbopackIgnore: true */ filePath)) return;
  const original = new DatabaseSync(filePath,{readOnly:true});
  try {
    if (original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_schema'").get()) return;
    const parent = path.join(path.dirname(filePath),"backups");
    await mkdir(parent,{recursive:true});
    const destination = await mkdtemp(path.join(parent,"before-runtime-"));
    await backup(original,path.join(destination,"checkpoint.sqlite"));
  } finally { original.close(); }
}

export class ResearchRuntime {
  readonly database: KousatsuDatabase;
  readonly store: ResearchStore;
  private readonly outputDirectory: string;
  private readonly sources: ResearchSource[];
  private readonly provider?: KousatsuAiProvider;
  private readonly providerForJob?: RuntimeOptions['providerForJob'];

  private constructor(database: KousatsuDatabase, options: RuntimeOptions, sources: ResearchSource[]) {
    this.database=database;
    this.store=new ResearchStore(database.filePath);
    this.sources=sources;
    this.outputDirectory=path.resolve(/* turbopackIgnore: true */ options.outputDirectory ?? runtimePaths().output);
    this.provider=options.provider;
    this.providerForJob=options.providerForJob;
  }

  static async open(options: RuntimeOptions = {}) {
    const sources=options.sources ?? await loadResearchSources();
    const databasePath=path.resolve(/* turbopackIgnore: true */ options.databasePath ?? runtimePaths().database);
    await preserveBeforeRuntime(databasePath);
    const database=new KousatsuDatabase(databasePath);
    try { return new ResearchRuntime(database,options,sources); }
    catch (error) { database.close(); throw error; }
  }

  close() { this.store.close(); this.database.close(); }

  snapshot() { return this.store.snapshot(this.sources); }

  enqueue(sourceId: string, topic?: string) {
    const source=this.sources.find((entry)=>entry.id===sourceId && entry.enabled);
    if (!source) throw new Error("SOURCE_NOT_ENABLED: choose an enabled local source.");
    const selectedTopic=(topic ?? source.topic).trim();
    if (!selectedTopic || selectedTopic.length>200) throw new Error("TOPIC_INVALID");
    return this.store.enqueue({source,topic:selectedTopic,outputDirectory:this.outputDirectory},Date.now(),source);
  }

  /** Trusted CLI/test input only; HTTP never accepts fixture or output paths. */
  enqueueInput(input: PipelineInput) { return this.store.enqueue({...input,outputDirectory:input.outputDirectory ?? this.outputDirectory}); }

  async tick(options: { schedule?: boolean; maxScheduledJobs?: number } = {}) {
    const token=this.store.acquireWorker();
    if (!token) return {status:"busy" as const};
    let leaseError: unknown;
    const heartbeat=setInterval(()=>{
      try { this.store.renewWorker(token); } catch (error) { leaseError=error; }
    },10_000);
    heartbeat.unref();
    try {
      if (options.schedule !== false) this.store.schedule(this.sources,this.outputDirectory,token,Date.now(),options.maxScheduledJobs);
      const next=this.store.nextJob();
      if (!next) return {status:"idle" as const};
      const job=this.database.getJob(next.jobId);
      if (!job) throw new Error("QUEUE_JOB_MISSING");
      try {
        if (job.status==='cancelled' || job.status==='failed') throw new Error("JOB_NOT_RETRYABLE");
        if (next.sourceConfig && !['succeeded','needs_review'].includes(job.status)) {
          const current=this.sources.find((source)=>source.id===next.sourceConfig!.id);
          if (!current?.enabled || JSON.stringify(current)!==JSON.stringify(next.sourceConfig)) {
            throw new Error('CHECKPOINT_SOURCE_CONFIG_MISMATCH: source disabled or configuration changed; cancel and create a new job.');
          }
        }
        const provider=withMemory(this.providerForJob?.(next.jobId) ?? this.provider ?? createAiProviderFromEnvironment(),next.memories);
        const result=await new KousatsuPipeline(this.database,{provider}).resume(next.jobId);
        if (leaseError) throw leaseError;
        this.store.complete(next.jobId,token);
        return {status:"completed" as const,jobId:next.jobId,result};
      } catch (error) {
        if (leaseError) throw leaseError;
        const message=error instanceof Error ? error.message : String(error);
        const latest=this.database.getJob(next.jobId);
        // Another CLI may legitimately own a pipeline lease. Do not mark its job failed.
        const transientOwner=/lease .*held|already.*lease|already.*running|ownership was lost|lease expired/i.test(message);
        const blocked=!transientOwner && (latest?.status==='failed' ||
          /CHECKPOINT_|LEGACY_CHECKPOINT_|ARTIFACT_CONFLICT|SOURCE_IDENTITY_|JOB_NOT_RETRYABLE|MEMORY_|Unsupported KOUSATSU|is required/.test(message));
        this.store.defer(next.jobId,message,blocked,token);
        return {status:blocked ? "blocked" as const : "retry_wait" as const,jobId:next.jobId,error:message};
      }
    } finally { clearInterval(heartbeat); this.store.releaseWorker(token); }
  }

  async note(id: string): Promise<ResearchNote | null> {
    const note=this.store.readNote(id);
    return describeNote(note);
  }
}

async function describeNote(note: ReturnType<ResearchStore['readNote']>): Promise<ResearchNote|null> {
  if (!note) return null;
  let artifact: ResearchNote['artifact']='unpublished';
  if (note.outputPath) {
    try {
      const stat=await lstat(/* turbopackIgnore: true */ note.outputPath);
      artifact=stat.isFile() && !stat.isSymbolicLink() && await readFile(/* turbopackIgnore: true */ note.outputPath,"utf8")===note.markdown ? "matching" : "conflict";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code==='ENOENT') artifact='missing'; else throw error;
    }
  }
  return {id:note.id,title:note.title,markdown:note.markdown,status:note.status,verification:note.verification,artifact};
}

export async function researchNote(id: string, options: {databasePath?: string} = {}): Promise<ResearchNote|null> {
  const databasePath=path.resolve(/* turbopackIgnore: true */ options.databasePath ?? runtimePaths().database);
  if (!existsSync(/* turbopackIgnore: true */ databasePath)) return null;
  const reader=new DatabaseSync(databasePath,{readOnly:true});
  try {
    if (!reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_schema'").get()) return null;
  } finally { reader.close(); }
  const store=new ResearchStore(databasePath,{readOnly:true});
  try { return await describeNote(store.readNote(id)); } finally { store.close(); }
}

/** An initial GET must not create a database, migrate data, or enqueue collection. */
export async function researchSnapshot(options: {databasePath?: string;sources?: ResearchSource[]} = {}): Promise<ResearchSnapshot> {
  const sources=options.sources ?? await loadResearchSources();
  const databasePath=path.resolve(/* turbopackIgnore: true */ options.databasePath ?? runtimePaths().database);
  const empty: ResearchSnapshot = {
    initialized:false,sources,worker:{active:false,lastSeenAt:null},jobs:[],notes:[],memories:[],interests:[],
  };
  if (!existsSync(/* turbopackIgnore: true */ databasePath)) return empty;
  const reader=new DatabaseSync(databasePath,{readOnly:true});
  try {
    if (!reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_schema'").get()) return empty;
  } finally { reader.close(); }
  const store=new ResearchStore(databasePath,{readOnly:true});
  try { return store.snapshot(sources); } finally { store.close(); }
}
