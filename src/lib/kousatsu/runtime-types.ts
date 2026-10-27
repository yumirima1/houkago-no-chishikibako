import type { JobStatus, SourceInput, VerificationReport } from "./types";

export type ResearchSource = SourceInput & {
  genre?: 'ai'|'pc'|'economy'|'world'|'science'|'culture'|'environment';
  enabled: boolean;
  intervalMinutes: number;
  topic: string;
};

export type MemoryContext = {
  id: string;
  jobId: string;
  topic: string;
  text: string;
  reason: string;
  createdAt: string;
  kind: "interpretation" | "hypothesis";
  verificationStatus: "passed" | "failed";
  factCheckStatus: "unverified" | "contradicted";
  references: Array<{ itemId: string; versionId: string; claimIds: string[] }>;
  quality?: import('./quality-types').QualityAnalysis;
};

export type ResearchSnapshot = {
  initialized: boolean;
  worker: { active: boolean; lastSeenAt: string | null };
  sources: ResearchSource[];
  jobs: Array<{
    id: string; topic: string; status: JobStatus; stage: string | null;
    error: string | null; queue: string | null; createdAt: string;
  }>;
  notes: Array<{
    genre?: string;
    id: string; jobId: string; title: string; createdAt: string;
    status: string; provider: string; model: string; published: boolean;
  }>;
  memories: MemoryContext[];
  interests: Array<{ topic: string; observations: number; score: number; lastSeenAt: string }>;
};

export type ResearchNote = {
  sources?: Array<{title:string;url:string}>;
  generation?: {origin:string;requested:string|null;used:string|null;elapsedMs:number|null;issues:string[]};
  id: string;
  title: string;
  markdown: string;
  status: string;
  verification: VerificationReport | null;
  artifact: "matching" | "missing" | "conflict" | "unpublished";
};
