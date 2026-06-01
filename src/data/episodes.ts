import { generatedEpisodes } from "./generatedEpisodes";

export type EpisodeType =
  | "regular"
  | "special"
  | "news"
  | "movie"
  | "weather"
  | "anniversary";

export type EpisodeDurationType = "normal" | "long";
export type EpisodeProductionStatus = "published" | "draft" | "reviewing" | "planned";

export type Episode = {
  id: string;
  title: string;
  description: string;
  audioUrl?: string;
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
  productionStatus: EpisodeProductionStatus;
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

export function getEpisodeNumberLabel(episode: Pick<Episode, "id">) {
  const match = episode.id.match(/^episode-(\d+)$/);

  return match ? `#${match[1].padStart(3, "0")}` : episode.id;
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
    anniversary: "自己紹介",
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

export function getEpisodeDurationLabel(episode: Episode) {
  if (episode.id === "episode-000") {
    return "約2分";
  }

  return getDurationTypeLabel(getEpisodeDurationType(episode));
}

export function getEpisodeProductionStatusLabel(
  status: EpisodeProductionStatus,
) {
  const labels: Record<EpisodeProductionStatus, string> = {
    draft: "準備中",
    planned: "企画中",
    published: "公開中",
    reviewing: "校閲中",
  };

  return labels[status];
}

export function hasPlayableAudio(episode: Episode) {
  return episode.productionStatus === "published" && Boolean(episode.audioUrl);
}
