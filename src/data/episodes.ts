import { generatedEpisodes } from "./generatedEpisodes";

export type Episode = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  publishedAt: string;
  duration: string;
  themes: string[];
  speakers: {
    science: string;
    humanities: string;
  };
  productionStatus: "published" | "draft" | "reviewing";
};

const manualEpisodes: Episode[] = [];

const manualEpisodeIds = new Set(manualEpisodes.map((episode) => episode.id));

export const episodes: Episode[] = [
  ...manualEpisodes,
  ...generatedEpisodes.filter((episode) => !manualEpisodeIds.has(episode.id)),
];
