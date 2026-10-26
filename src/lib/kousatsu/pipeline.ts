import { readFile } from "node:fs/promises";
import path from "node:path";

import { createGroundedArticle, articleSlug } from "./article";
import {
  createAiProviderFromEnvironment,
  type KousatsuAiProvider,
} from "./ai";
import { KousatsuDatabase } from "./database";
import { contentDigest, publishArtifact } from "./artifact-store";
import { collectFeedXml, fetchFeed, type CollectResult } from "./ingest";
import { extractSourceClaims, relateItems } from "./knowledge";
import type {
  AnalysisResult,
  ArticleDraft,
  ClaimRecord,
  EvidenceRecord,
  ItemSourceRecord,
  PipelineInput,
  PipelineResult,
  RelationRecord,
  StoredItem,
  VerificationReport,
} from "./types";
import { verifyArticle } from "./verify";
import { prepareResearchDocuments } from './research-documents';
import type { DocumentCoverage } from './quality-types';

const DEFAULT_OUTPUT_DIRECTORY = path.join(
  process.cwd(),
  "content",
  "kousatsu",
  "articles",
);

type PipelineOptions = {
  /** Trusted process-local injection for network failure/recovery tests; never API input. */
  articleTransport?: typeof fetchFeed;
  failAfterStage?: string;
  provider?: KousatsuAiProvider;
  leaseMs?: number;
  /** Failure/termination tests observe committed boundaries, never open transactions. */
  afterStage?: (stage: string) => void | Promise<void>;
};

type ExecutionCheckpoint = {
  schema: 2;
  inputHash: string;
  fixtureHash: string | null;
  providerHash: string;
};

type ItemCheckpoint = {
  coverage?: DocumentCoverage[];
  followUp?: Array<{url:string;status:string;reason:string}>;
  items: StoredItem[];
  pins: Array<{ id: string; digest: string }>;
  sourceDigest: string;
  /** Frozen aliases, including historical associations for these exact versions. */
  sources?: ItemSourceRecord[];
};

type ClaimCheckpoint = { claims: ClaimRecord[]; evidence: EvidenceRecord[]; integrityDigest?:string };
type DraftCheckpoint = { article: ArticleDraft; articleId: string; slug: string };
type ExportCheckpoint = {
  schema: 2;
  articlePath: string;
  verificationPath: string;
  articleDigest: string;
  verificationDigest: string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: unknown) {
  return contentDigest(canonical(value));
}

function inputIdentity(input: PipelineInput) {
  return {
    ...input,
    fixturePath: input.fixturePath ? path.resolve(/* turbopackIgnore: true */ input.fixturePath) : null,
    outputDirectory: path.resolve(/* turbopackIgnore: true */ input.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY),
    maxAttempts: input.maxAttempts ?? 3,
    source: { ...input.source, contentPolicy: input.source.contentPolicy ?? "metadata-and-feed-summary" },
  };
}

function itemIdentity(item: StoredItem | null) {
  if (!item) return null;
  // A successful re-fetch of unchanged bytes does not change a document version.
  return { ...item, fetchedAt: undefined };
}

function documentIdentity(item: StoredItem) {
  // Alias URLs and fetch dates can change independently of this immutable body.
  return {
    id: item.id, versionId: item.versionId, contentHash: item.contentHash,
    title: item.title, summary: item.summary, content: item.content,
    author: item.author, publishedAt: item.publishedAt,
  };
}

function sourceAliasIdentity(source: ItemSourceRecord) {
  // Fetch metadata (URL tracking parameters, external ID, timestamps) may be
  // refreshed in place. The completed checkpoint retains the observed values.
  return {
    itemId: source.itemId, versionId: source.versionId, sourceId: source.sourceId,
    canonicalUrl: source.canonicalUrl,
  };
}

function sourceIdentity(database: KousatsuDatabase, sourceId: string) {
  return database.listItemsForSource(sourceId)
    .map((item) => ({ id: item.id, versionId: item.versionId, url: item.url, contentHash: item.contentHash }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function ordered<T extends { id: string }>(values: T[]) {
  return [...values].sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueItems(items: StoredItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function failForTest(stage: string, requested?: string) {
  if (requested === stage) {
    throw new Error(`Injected failure after ${stage}.`);
  }
}

export class KousatsuPipeline {
  private readonly database: KousatsuDatabase;
  private readonly provider: KousatsuAiProvider;
  private readonly failAfterStage?: string;
  private readonly leaseMs: number;
  private readonly afterStage?: PipelineOptions["afterStage"];
  private readonly articleTransport?: PipelineOptions['articleTransport'];

  constructor(database: KousatsuDatabase, options: PipelineOptions = {}) {
    this.database = database;
    this.provider = options.provider ?? createAiProviderFromEnvironment();
    this.failAfterStage = options.failAfterStage;
    this.leaseMs = options.leaseMs ?? 30_000;
    this.afterStage = options.afterStage;
    this.articleTransport=options.articleTransport;
    if (!Number.isFinite(this.leaseMs) || this.leaseMs < 100) {
      throw new Error("leaseMs must be at least 100 milliseconds.");
    }
  }

  async run(input: PipelineInput) {
    const jobId = this.database.createJob(input);
    return this.resume(jobId);
  }

  private async boundary(stage: string) {
    await this.afterStage?.(stage);
    failForTest(stage, this.failAfterStage);
  }

  async resume(jobId: string): Promise<PipelineResult> {
    if (!this.database.getJob(jobId)) throw new Error(`Job not found: ${jobId}`);
    // Acquisition and all mutations are fenced by a token. A second caller
    // cannot update this job, its checkpoints, or its exported files.
    const lease = this.database.acquireJobLease(jobId, { leaseMs: this.leaseMs });
    // Another process may have completed the job just before acquisition.
    const job = this.database.getJob(jobId)!;
    const restoringExport = job.status === "succeeded" || job.status === "needs_review";
    let leaseError: unknown;
    const heartbeat = setInterval(() => {
      try {
        this.database.renewJobLease(jobId, lease.token, this.leaseMs);
      } catch (error) { leaseError = error; }
    }, Math.max(25, Math.floor(this.leaseMs / 3)));
    heartbeat.unref();
    let attempt: number | undefined;
    const result: PipelineResult = {
      collectedCount: job.output?.collectedCount ?? 0,
      jobId,
      newItemCount: job.output?.newItemCount ?? 0,
      status: "running",
    };

    const assertLease = () => {
      if (leaseError) throw leaseError;
      this.database.assertJobLease(jobId, lease.token);
    };
    const assertContext = () => {
      assertLease();
      if (digest(inputIdentity(this.database.getJob(jobId)!.input)) !== digest(inputIdentity(job.input))) {
        throw new Error("CHECKPOINT_INPUT_MISMATCH: persisted job input changed.");
      }
      const execution = this.database.getCheckpoint<ExecutionCheckpoint>(jobId, "execution");
      if (execution && execution.inputHash !== digest(inputIdentity(job.input))) {
        throw new Error("CHECKPOINT_INPUT_MISMATCH: persisted job input no longer matches its pinned identity.");
      }
      if (restoringExport) {
        this.assertHistoricalExport(jobId);
        return;
      }
      const selected = this.database.getCheckpoint<ItemCheckpoint>(jobId, "selected-items");
      if (!selected) return;
      for (const pin of selected.pins) {
        if (digest(itemIdentity(this.database.getItem(pin.id))) !== pin.digest) {
          throw new Error(`CHECKPOINT_VERSION_MISMATCH: selected document changed: ${pin.id}`);
        }
      }
      if (digest(sourceIdentity(this.database, job.input.source.id)) !== selected.sourceDigest) {
        throw new Error("CHECKPOINT_VERSION_MISMATCH: source document associations changed.");
      }
      const classified = this.database.getCheckpoint<ClaimCheckpoint>(jobId, "classify");
      if (classified) {
        const claims = this.database.listClaims(selected.items.map((item) => item.id));
        const evidence = this.database.listEvidence(claims.map((claim) => claim.id));
        if (digest({ claims: ordered(claims), evidence: ordered(evidence) }) !==
            (classified.integrityDigest ?? digest({ claims: ordered(classified.claims), evidence: ordered(classified.evidence) }))) {
          throw new Error("CHECKPOINT_VERSION_MISMATCH: claims or evidence changed.");
        }
      }
    };
    const commit = <T>(operation: () => T) => this.database.withJobLease(jobId, lease.token, () => {
      assertContext();
      return operation();
    });

    try {
      // Restoring an already completed export is not another analysis attempt.
      // Use its immutable DB records, not today's feed, fixture, or model config.
      if (restoringExport) {
        const draft = this.database.getCheckpoint<DraftCheckpoint>(jobId, "draft");
        const verification = this.database.getCheckpoint<VerificationReport>(jobId, "verify");
        commit(() => this.assertHistoricalExport(jobId));
        const exported = await this.exportArticle(jobId, draft!, verification!, job.input, commit, assertContext);
        return { ...result, ...job.output, ...exported, status: job.status };
      }
      const fixture = job.input.fixturePath
        ? await readFile(/* turbopackIgnore: true */ path.resolve(job.input.fixturePath), "utf8") : null;
      const execution: ExecutionCheckpoint = {
        schema: 2,
        inputHash: digest(inputIdentity(job.input)),
        fixtureHash: fixture === null ? null : contentDigest(fixture),
        providerHash: digest({ id: this.provider.id, model: this.provider.model,
          configuration: this.provider.configurationFingerprint ?? null }),
      };
      commit(() => {
        const previous = this.database.getCheckpoint<ExecutionCheckpoint>(jobId, "execution");
        if (previous && canonical(previous) !== canonical(execution)) {
          throw new Error("CHECKPOINT_INPUT_MISMATCH: input, fixture, or provider settings changed; create a new job.");
        }
        if (!previous) {
          if (job.attempts > 0 || job.status !== "pending") {
            throw new Error("LEGACY_CHECKPOINT_UNPINNED: old job has no input identity; preserve it and create a new job.");
          }
          this.database.saveCheckpoint(jobId, "execution", execution);
        }
      });

      attempt = commit(() => this.database.startJobAttempt(jobId, this.provider.id, this.provider.model));
      commit(() => this.database.setJobStage(jobId, "collect"));
      let collection = this.database.getCheckpoint<CollectResult>(jobId, "collect");
      if (!collection && job.input.articleRef) {
        collection=commit(()=>{
          const ref=job.input.articleRef!;
          const item=this.database.getItemVersion(ref.versionId);
          if(!item || item.id!==ref.itemId || this.database.getItem(item.id)?.versionId!==ref.versionId ||
            !this.database.listItemSources(item.id,{includeHistorical:true}).some(s=>s.sourceId===job.input.source.id && s.versionId===ref.versionId)) {
            throw new Error('CHECKPOINT_ARTICLE_REFERENCE_MISMATCH');
          }
          const value:CollectResult={fetchRunId:'stored-article',itemIds:[item.id],newItemCount:0,totalItemCount:1,responseHash:item.contentHash};
          this.database.saveCheckpoint(jobId,'selected-items',{items:[item],pins:[{id:item.id,digest:digest(itemIdentity(item))}],
            sourceDigest:digest(sourceIdentity(this.database,job.input.source.id)),sources:this.database.listItemSources(item.id,{includeHistorical:true}).filter(s=>s.versionId===ref.versionId)} satisfies ItemCheckpoint);
          this.database.saveCheckpoint(jobId,'collect',value);return value;
        });
      }
      if (!collection) {
        const source = { ...job.input.source, feedUrl: job.input.feedUrl ?? job.input.source.feedUrl };
        const fetchRunId=commit(()=>{this.database.upsertSource(source);return this.database.beginFetch(source.id);});
        let fetched: {text:string;httpStatus:number};
        try {fetched=fixture === null ? await fetchFeed(source.feedUrl) : { text: fixture, httpStatus: 200 };}
        catch(error) {
          commit(()=>this.database.finishFetch(fetchRunId,{status:'failed',
            error:error instanceof Error ? error.message : String(error)}));
          throw error;
        }
        try {collection = commit(() => {
          const collected = collectFeedXml(this.database, source, fetched.text, fetched.httpStatus,fetchRunId);
          const sourceItems = this.database.listItemsForSource(job.input.source.id);
          const searchItems = this.database.search(job.input.topic, 30);
          // Always use the primary document view for evidence URLs; aliases
          // remain queryable in the source/version association tables.
          const items = uniqueItems(searchItems.length ? searchItems : sourceItems.filter((item) => collected.itemIds.includes(item.id)))
            .slice(0,30)
            .map((item) => this.database.getItem(item.id)!).filter(Boolean);
          if (!items.length) throw new Error("No stored items matched the pipeline input.");
          this.database.saveCheckpoint(jobId, "selected-items", {
            items,
            pins: items.map((item) => ({ id: item.id, digest: digest(itemIdentity(item)) })),
            sourceDigest: digest(sourceIdentity(this.database, job.input.source.id)),
            sources: items.flatMap((item) => this.database.listItemSources(item.id, { includeHistorical: true })
              .filter((source) => source.versionId === item.versionId)),
          } satisfies ItemCheckpoint);
          this.database.saveCheckpoint(jobId, "collect", collected);
          return collected;
        });} catch(error) {
          commit(()=>this.database.finishFetch(fetchRunId,{status:'failed',httpStatus:fetched.httpStatus,
            error:error instanceof Error ? error.message : String(error)}));
          throw error;
        }
      }
      result.collectedCount = collection.totalItemCount;
      result.newItemCount = collection.newItemCount;
      await this.boundary("collect");

      let selected = this.database.getCheckpoint<ItemCheckpoint>(jobId, "selected-items");
      if (!selected) throw new Error("CHECKPOINT_INCOMPLETE: missing pinned documents.");
      if(job.input.source.articlePolicy?.enabled && !this.database.getCheckpoint(jobId,'article-content')) {
        commit(()=>this.database.setJobStage(jobId,'article-content'));
        const prepared=await prepareResearchDocuments(this.database.filePath,structuredClone(selected.items),job.input.source,this.articleTransport);
        selected=commit(()=>{
          const items:StoredItem[]=[],coverage:DocumentCoverage[]=[];
          for(const entry of prepared.entries) {
            const body=entry.result.document;
            const candidate={...entry.item,...(body ? {content:body.text,fetchedAt:body.fetchedAt} : {})};
            const stored=body ? this.database.getItem(this.database.upsertItem(candidate).id)! : entry.item;
            items.push(stored);
            const c:DocumentCoverage={itemId:stored.id,versionId:stored.versionId!,url:stored.url,
              fetchedAt:body?.fetchedAt ?? stored.fetchedAt,kind:body ? 'article-body' : stored.summary || stored.content ? 'feed-summary' : 'metadata',
              status:entry.result.status,...(body ? {documentId:body.id} : {}),...(entry.result.error ? {error:entry.result.error} : {})};
            coverage.push(c);this.database.saveDocumentCoverage(stored.versionId!,body?.id ?? null,c);
          }
          const value:ItemCheckpoint={items,coverage,followUp:prepared.followUp,
            pins:items.map(item=>({id:item.id,digest:digest(itemIdentity(item))})),sourceDigest:digest(sourceIdentity(this.database,job.input.source.id)),
            sources:items.flatMap(item=>this.database.listItemSources(item.id,{includeHistorical:true}).filter(source=>source.versionId===item.versionId))};
          this.database.saveCheckpoint(jobId,'selected-items',value);
          this.database.saveCheckpoint(jobId,'article-content',{coverage,followUp:prepared.followUp});return value;
        });
        await this.boundary('article-content');
      }
      const { items } = selected;

      commit(() => this.database.setJobStage(jobId, "classify"));
      let classified = this.database.getCheckpoint<ClaimCheckpoint>(jobId, "classify");
      if (!classified) {
        classified = commit(() => {
          const claims = extractSourceClaims(this.database, items,selected!.coverage);
          const allClaims=this.database.listClaims(items.map(item=>item.id));
          const allEvidence=this.database.listEvidence(allClaims.map(claim=>claim.id));
          const value:ClaimCheckpoint = { claims, evidence: this.database.listEvidence(claims.map((claim) => claim.id)),
            integrityDigest:digest({claims:ordered(allClaims),evidence:ordered(allEvidence)}) };
          this.database.saveCheckpoint(jobId, "classify", value);
          return value;
        });
      }
      const { claims, evidence } = classified;
      await this.boundary("classify");

      commit(() => this.database.setJobStage(jobId, "relate"));
      let relations = this.database.getCheckpoint<RelationRecord[]>(jobId, "relate");
      if (!relations) {
        relations = commit(() => {
          const value = relateItems(this.database, items);
          this.database.saveCheckpoint(jobId, "relate", value);
          return value;
        });
      }
      await this.boundary("relate");

      commit(() => this.database.setJobStage(jobId, "analyze"));
      let analysis = this.database.getCheckpoint<AnalysisResult>(jobId, "analyze");
      if (!analysis) {
        analysis = await this.provider.analyze(structuredClone({
          claims,
          items,
          relations,
          topic: job.input.topic,
          coverage:selected.coverage,
        }));
        const value = analysis;
        if(value.quality && selected.followUp)value.quality.followUp=selected.followUp;
        commit(() => {
          this.database.saveAnalysis({ ...value, jobId, topic: job.input.topic });
          this.database.saveCheckpoint(jobId, "analyze", value);
        });
      }
      await this.boundary("analyze");

      const additionalSources=(analysis.research?.counterSearch ?? []).map(candidate => {
        const archived=this.database.getItemVersion(candidate.versionId);
        if (!archived || archived.id!==candidate.itemId || archived.url!==candidate.url ||
            ![archived.title,archived.summary ?? '',archived.content ?? ''].some(text => text.includes(candidate.excerpt))) {
          throw new Error('CHECKPOINT_RESEARCH_SOURCE_MISMATCH');
        }
        return archived;
      });

      commit(() => this.database.setJobStage(jobId, "draft"));
      let articleCheckpoint = this.database.getCheckpoint<DraftCheckpoint>(jobId, "draft");
      if (!articleCheckpoint) {
        const article = createGroundedArticle({
          analysis,
          claims,
          items,
          sources: selected.sources,
          relations,
          topic: job.input.topic,
        });
        const slug = articleSlug(job.input.topic);
        const analyzed = analysis;
        articleCheckpoint = commit(() => {
          const articleId = this.database.saveArticle({
            claimIds: article.usedClaimIds, jobId, markdown: article.markdown,
            model: analyzed.model, provider: analyzed.provider, slug, title: article.title,
          });
          const value = { article, articleId, slug };
          this.database.saveCheckpoint(jobId, "draft", value);
          return value;
        });
      }
      result.articleId = articleCheckpoint.articleId;
      await this.boundary("draft");

      commit(() => this.database.setJobStage(jobId, "verify"));
      let verification = this.database.getCheckpoint<VerificationReport>(
        jobId,
        "verify",
      );
      if (!verification) {
        verification = verifyArticle({
          article: articleCheckpoint.article,
          claims,
          evidence,
          items,
          sources: selected.sources,
          additionalSources,
        });
        const checked = verification, articleId = articleCheckpoint.articleId;
        commit(() => {
          this.database.saveVerification(articleId, checked);
          this.database.saveCheckpoint(jobId, "verify", checked);
        });
      }
      await this.boundary("verify");

      commit(() => this.database.setJobStage(jobId, "export"));
      Object.assign(result, await this.exportArticle(jobId, articleCheckpoint, verification, job.input, commit, assertContext));
      result.status = verification.status === "passed" ? "succeeded" : "needs_review";
      const completedAttempt = attempt;
      commit(() => this.database.finishJob(jobId, completedAttempt, result.status as "succeeded" | "needs_review", result));
      return result;
    } catch (error) {
      const latest = this.database.getJob(jobId);
      const message = error instanceof Error ? error.message : String(error);
      const canRetry = Boolean(latest && latest.attempts < latest.maxAttempts);
      const status = canRetry ? "retry_wait" : "failed";
      result.status = status;
      // A stale worker must not overwrite the new owner's state or diagnostic.
      try {
        this.database.withJobLease(jobId, lease.token, () => {
          this.database.recordJobDiagnostic(jobId, message);
          this.database.saveCheckpoint(jobId, "diagnostic", { message, at: new Date().toISOString() });
          if (attempt !== undefined) this.database.finishJob(jobId, attempt, status, result, message);
        });
      } catch { /* Lost ownership: leave recovery to the valid owner. */ }
      throw error;
    } finally {
      clearInterval(heartbeat);
      this.database.releaseJobLease(jobId, lease.token);
    }
  }

  private assertHistoricalExport(jobId: string) {
    const job = this.database.getJob(jobId)!;
    const execution = this.database.getCheckpoint<ExecutionCheckpoint>(jobId, "execution");
    const selected = this.database.getCheckpoint<ItemCheckpoint>(jobId, "selected-items");
    const classified = this.database.getCheckpoint<ClaimCheckpoint>(jobId, "classify");
    const draft = this.database.getCheckpoint<DraftCheckpoint>(jobId, "draft");
    const verification = this.database.getCheckpoint<VerificationReport>(jobId, "verify");
    const exported = this.database.getCheckpoint<ExportCheckpoint>(jobId, "export");
    const published = this.database.getCheckpoint<ExportCheckpoint>(jobId, "published");
    if (execution?.schema !== 2 || !selected || !classified || !draft || !verification || !exported || !published) {
      throw new Error("CHECKPOINT_INCOMPLETE: terminal job lacks immutable export records.");
    }
    if (execution.inputHash !== digest(inputIdentity(job.input))) {
      throw new Error("CHECKPOINT_INPUT_MISMATCH: terminal job input changed.");
    }
    if (selected.items.length !== selected.pins.length ||
        new Set(selected.pins.map((pin) => pin.id)).size !== selected.pins.length) {
      throw new Error("CHECKPOINT_VERSION_MISMATCH: historical document pins are incomplete.");
    }
    for (const item of selected.items) {
      const pin = selected.pins.find((entry) => entry.id === item.id);
      const archived = item.versionId ? this.database.getItemVersion(item.versionId) : null;
      if (!pin || pin.digest !== digest(itemIdentity(item)) || !archived ||
          digest(documentIdentity(archived)) !== digest(documentIdentity(item))) {
        throw new Error(`CHECKPOINT_VERSION_MISMATCH: historical document changed: ${item.id}`);
      }
    }
    for (const source of selected.sources ?? []) {
      const archived = this.database.listItemSources(source.itemId, { includeHistorical: true });
      if (!selected.items.some((item) => item.id === source.itemId && item.versionId === source.versionId) ||
          !archived.some((entry) => digest(sourceAliasIdentity(entry)) === digest(sourceAliasIdentity(source)))) {
        throw new Error("CHECKPOINT_VERSION_MISMATCH: historical source alias changed.");
      }
    }
    const claimIds = new Set(classified.claims.map((claim) => claim.id));
    const claims = this.database.listClaims(selected.items.map((item) => item.id), { includeHistorical: true })
      .filter((claim) => claimIds.has(claim.id));
    const evidence = this.database.listEvidence([...claimIds]);
    if (digest({ claims: ordered(claims), evidence: ordered(evidence) }) !==
        digest({ claims: ordered(classified.claims), evidence: ordered(classified.evidence) })) {
      throw new Error("CHECKPOINT_VERSION_MISMATCH: historical claims or evidence changed.");
    }
    const stored = this.database.getArticle(draft.articleId);
    const storedVerification = this.database.getArticleVerification(draft.articleId);
    if (exported.schema !== 2 || canonical(exported) !== canonical(published) ||
        !/^[a-z0-9][a-z0-9-]*$/.test(draft.slug) ||
        job.output?.articleId !== draft.articleId || job.output.articlePath !== exported.articlePath ||
        job.output.verificationPath !== exported.verificationPath ||
        !stored || stored.jobId !== jobId || stored.markdown !== draft.article.markdown ||
        stored.outputPath !== exported.articlePath ||
        canonical(storedVerification) !== canonical(verification)) {
      throw new Error("CHECKPOINT_EXPORT_MISMATCH: completed job and canonical export records differ.");
    }
  }

  private async exportArticle(
    jobId: string,
    draft: DraftCheckpoint,
    verification: VerificationReport,
    input: PipelineInput,
    commit: <T>(operation: () => T) => T,
    assertOwnership: () => void,
  ) {
    const stored = this.database.getArticle(draft.articleId);
    if (!stored || stored.jobId !== jobId || stored.markdown !== draft.article.markdown) {
      throw new Error("CHECKPOINT_EXPORT_MISMATCH: DB article and checkpoint differ.");
    }
    const contents = `${JSON.stringify(verification, null, 2)}\n`;
    const directory = path.resolve(/* turbopackIgnore: true */ input.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY);
    // Full UUID avoids the old eight-character suffix collision window.
    const manifest: ExportCheckpoint = {
      schema: 2,
      articlePath: path.join(directory, `${draft.slug}-${jobId}.md`),
      verificationPath: path.join(directory, `${draft.slug}-${jobId}.verification.json`),
      articleDigest: contentDigest(stored.markdown),
      verificationDigest: contentDigest(contents),
    };
    commit(() => {
      const previous = this.database.getCheckpoint<ExportCheckpoint>(jobId, "export");
      if (previous && canonical(previous) !== canonical(manifest)) {
        throw new Error("CHECKPOINT_EXPORT_MISMATCH: export manifest changed.");
      }
      if (!previous) this.database.saveCheckpoint(jobId, "export", manifest);
    });
    await this.boundary("export-manifest");
    await publishArtifact(manifest.articlePath, stored.markdown, assertOwnership);
    await this.boundary("export-markdown");
    await publishArtifact(manifest.verificationPath, contents, assertOwnership);
    await this.boundary("export-verification");
    commit(() => {
      this.database.setArticleOutputPath(draft.articleId, manifest.articlePath);
      this.database.saveCheckpoint(jobId, "published", manifest);
    });
    await this.boundary("export");
    return { articlePath: manifest.articlePath, verificationPath: manifest.verificationPath };
  }
}
