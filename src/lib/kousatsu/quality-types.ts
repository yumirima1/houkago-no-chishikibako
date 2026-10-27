export type DocumentCoverage = {
  itemId: string; versionId: string; kind: 'metadata' | 'feed-summary' | 'article-body';
  status: 'available' | 'disabled' | 'failed' | 'denied';
  url: string; fetchedAt: string; documentId?: string; error?: string;
};
export type GroundedObservation = {
  claimId: string; itemId: string; versionId: string; quote: string; url: string;
  kind: DocumentCoverage['kind']; confidence: 'source-only';
};
export type TestedHypothesis = {
  text: string; premiseClaimIds: string[]; prediction: string; falsification: string;
  alternative: string; requiredEvidence: string; confidence: number;
  status: 'unverified' | 'supported' | 'refuted' | 'inconclusive';
};
export type Reflection = {
  issue:string; position:string; reasoning:string; alternative:string; revisionCondition:string;
  premiseClaimIds:string[]; assumptions:string[]; confidence:number;
  origin:'model'|'rules'|'mixed'; scope:'article'|'headline'|'no-source'; memoryIds?:string[];
  counterClaimIds?:string[];
};
export type QualityAnalysis = {
  sourceVerification?:import('./source-verification').SourceVerification;
  /** Optional only for immutable notes produced before the reflection revision. */
  reflection?:Reflection;
  viewReviews?:Array<{memoryId:string;action:'maintain'|'revise'|'withdraw';reason:string;previousConfidence:number;confidence:number;counterClaimIds:string[]}>;
  schema: 2; question: string; focusItemIds: string[];
  coverage: DocumentCoverage[]; observations: GroundedObservation[];
  conclusions: Array<{text: string; premiseClaimIds: string[]; reasoning: string; alternative: string}>;
  hypotheses: TestedHypothesis[]; unresolved: string[];
  comparisons: Array<{leftItemId: string; rightItemId: string; kind: string; reason: string}>;
  modelIssues: string[]; status: 'grounded' | 'limited' | 'deferred';
  priorMemory: Array<{id: string; decision: 'related' | 'excluded'; reason: string}>;
  hypothesisReviews?: Array<{memoryId:string; status:'supported'|'refuted'|'inconclusive';confidence:number;reason:string;claimIds:string[]}>;
  followUp: Array<{url: string; status: string; reason: string}>;
};
export type GroundedModelProposal = {
  interestEvaluations?:unknown;
  reflection?:Omit<Reflection,'origin'|'scope'>;
  observations: Array<{claimId: string; quote: string}>;
  conclusions: Array<{text: string; premiseClaimIds: string[]; reasoning: string; alternative: string}>;
  hypotheses: TestedHypothesis[];
};
