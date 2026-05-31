import { generatedEpisodes } from "./generatedEpisodes";

export type EpisodeType =
  | "regular"
  | "special"
  | "news"
  | "movie"
  | "weather"
  | "anniversary";

export type EpisodeDurationType = "normal" | "long";

export type Episode = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  durationType?: EpisodeDurationType;
  publishedAt: string;
  duration: string;
  tags?: string[];
  themes: string[];
  type?: EpisodeType;
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

export function getEpisodeTags(episode: Episode) {
  return episode.tags?.length ? episode.tags : episode.themes;
}

export function getEpisodeType(episode: Episode): EpisodeType {
  if (episode.type) {
    return episode.type;
  }

  return episode.id === "episode-000" ? "anniversary" : "regular";
}

export function getEpisodeDurationType(
  episode: Episode,
): EpisodeDurationType {
  if (episode.durationType) {
    return episode.durationType;
  }

  return getEpisodeType(episode) === "special" ? "long" : "normal";
}

export function getEpisodeTypeLabel(type: EpisodeType) {
  const labels: Record<EpisodeType, string> = {
    anniversary: "特別回",
    movie: "映画回",
    news: "ニュース回",
    regular: "通常回",
    special: "特別回",
    weather: "天気回",
  };

  return labels[type];
}

export function getDurationTypeLabel(durationType: EpisodeDurationType) {
  return durationType === "long" ? "60分前後" : "20-30分";
}
