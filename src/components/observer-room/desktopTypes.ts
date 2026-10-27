import type { ResearchSnapshot } from "@/lib/kousatsu/runtime-types";

export type CollectedNews = {
  genre?: string;
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  fetchedAt: string;
  summary: string;
  content: string;
  truncated: boolean;
};

export type ObserverDesktopSnapshot = ResearchSnapshot & {
  research?:{openInquiries:number;exhaustedInquiries:number;interestScores:Array<{genre:string;score:number}>;lastSelection?:{sources:Array<{id:string;score:number;candidateLimit:number}>}|null};
  operation?: {state:string;nextRunAt:string|null;lastRunAt:string|null;operation:{startsAt:string;endsAt:string|null;runTimes?:string[];continuous?:boolean}} | null;
  news: CollectedNews[];
  system: {
    readAt: string;
    supervisorActive: boolean;
    pollSeconds: number;
    maxJobsPerCycle: number;
    provider: string;
    model: string;
    access: "read-only";
  };
};
