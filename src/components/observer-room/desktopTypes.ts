import type { ResearchSnapshot } from "@/lib/kousatsu/runtime-types";

export type CollectedNews = {
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
