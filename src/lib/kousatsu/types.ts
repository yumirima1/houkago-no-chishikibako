import type { QualityAnalysis } from './quality-types';

export const claimClassifications = [
  "confirmed_fact",
  "source_claim",
  "inference",
  "opinion",
  "hypothesis",
  "unverified",
  "contradiction",
] as const;

export type ClaimClassification = (typeof claimClassifications)[number];

export const jobStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "retry_wait",
  "cancelled",
  "needs_review",
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export type SourceInput = {
  articlePolicy?: {enabled: boolean; allowedHosts: string[]; maxArticles: number; cacheMinutes: number; followLinks: number};
  contentPolicy?: "metadata-only" | "metadata-and-feed-summary";
  feedUrl: string;
  id: string;
  name: string;
};

export type FeedEntry = {
  author?: string;
  content?: string;
  externalId?: string;
  publishedAt?: string;
  summary?: string;
  title: string;
  url: string;
};

export type StoredItem = FeedEntry & {
  canonicalUrl: string;
  contentHash: string;
  fetchedAt: string;
  id: string;
  sourceId: string;
  /** Immutable document snapshot; absent only on pre-v2 callers. */
  versionId?: string;
  legacyContentHash?: string;
  provenance?: "observed" | "legacy-unknown";
};

export type ItemSourceRecord = {
  canonicalUrl: string;
  externalId?: string;
  firstFetchedAt: string;
  itemId: string;
  lastFetchedAt: string;
  sourceId: string;
  url: string;
  versionId: string;
};

export type ClaimRecord = {
  classification: ClaimClassification;
  confidence: number | null;
  createdAt: string;
  id: string;
  itemId: string | null;
  reason: string;
  text: string;
  versionId?: string;
};

export type EvidenceRecord = {
  claimId: string;
  excerpt: string;
  id: string;
  itemId: string;
  locator: string;
  stance: "supports" | "contradicts";
  versionId?: string;
};

export type RelationRecord = {
  fromItemId: string;
  id: string;
  reason: string;
  relationType: "similar_topic" | "same_event" | "supports" | "contradicts";
  score: number;
  toItemId: string;
};

export type SearchResult = StoredItem & {
  rank: number;
  sourceName: string;
};

export type ArticleAssertion = {
  claimId?: string;
  classification: ClaimClassification;
  text: string;
};

export type ArticleDraft = {
  quality?: QualityAnalysis;
  assertions: ArticleAssertion[];
  markdown: string;
  title: string;
  usedClaimIds: string[];
};

export type AnalysisResult = {
  quality?: QualityAnalysis;
  hypotheses: Array<{ rationale: string; text: string }>;
  model: string;
  provider: string;
  summary: string;
  research?: {
    topic: string;
    reason: string;
    candidates: string[];
    memories: Array<{id: string; jobId: string; text: string}>;
    evidence: Array<{claimId: string; itemId: string; versionId: string; excerpt: string; url: string}>;
    counterSearch: Array<{itemId: string; versionId: string; title: string; url: string; excerpt: string; reason: string}>;
    questions: string[];
    model: {requested: string; used: string; elapsedMs: number; error: string | null;status?:'succeeded'|'partial'|'failed'|'not-requested';responseReceived?:boolean;method?:'model'|'rules'|'mixed'};
  };
};

export type VerificationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type VerificationReport = {
  grounding?: {status:'grounded'|'limited'|'deferred';quoteChecks:number;independentVerification:'not-performed';semanticReview:'pending'};
  checkedAt: string;
  issues: VerificationIssue[];
  status: "passed" | "failed";
  scope?: "structure-and-references";
  factCheckStatus?: "unverified" | "contradicted";
};

export type PipelineInput = {
  researchPlan?:{inquiryIds:string[];question:string;reason:string;sourceBudget:{candidateLimit:number;bodyLimit:number}};
  /** Trusted local scheduler: analyze this stored article, never refetch a whole feed. */
  articleRef?: {itemId:string;versionId:string};
  feedUrl?: string;
  fixturePath?: string;
  maxAttempts?: number;
  outputDirectory?: string;
  source: SourceInput;
  topic: string;
};

export type PipelineResult = {
  articleId?: string;
  articlePath?: string;
  collectedCount: number;
  jobId: string;
  newItemCount: number;
  status: JobStatus;
  verificationPath?: string;
};

export type JobRecord = {
  startedAt?:string|null;
  finishedAt?:string|null;
  attempts: number;
  currentStage: string | null;
  id: string;
  input: PipelineInput;
  lastError: string | null;
  maxAttempts: number;
  output: Partial<PipelineResult> | null;
  status: JobStatus;
  type: string;
};
