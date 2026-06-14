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
const FIRST_PUBLIC_REGULAR_EPISODE_NUMBER = 5;
const LATEST_PUBLIC_EPISODE_NUMBER = 37;
const MIN_PUBLIC_AUDIO_SECONDS = 40;

export const episodes: Episode[] = [
  ...manualEpisodes,
  ...generatedEpisodes.filter((episode) => !manualEpisodeIds.has(episode.id)),
];

function getEpisodeNumber(episode: Pick<Episode, "id">) {
  const match = episode.id.match(/^episode-(\d+)$/);

  return match ? Number(match[1]) : null;
}

function parseDurationSeconds(duration: string) {
  const parts = duration.split(":").map((part) => Number(part));

  if (parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;

    return hours * 3600 + minutes * 60 + seconds;
  }

  const [minutes = 0, seconds = 0] = parts;

  return minutes * 60 + seconds;
}

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

export function isUserVisibleEpisode(episode: Episode) {
  const episodeNumber = getEpisodeNumber(episode);

  if (episode.productionStatus !== "published") {
    return false;
  }

  if (episodeNumber === null) {
    return false;
  }

  if (
    episodeNumber !== 0 &&
    episodeNumber < FIRST_PUBLIC_REGULAR_EPISODE_NUMBER
  ) {
    return false;
  }

  if (episodeNumber > LATEST_PUBLIC_EPISODE_NUMBER) {
    return false;
  }

  return parseDurationSeconds(episode.duration) >= MIN_PUBLIC_AUDIO_SECONDS;
}

export function sortEpisodesForPublicDisplay(episodeList: Episode[]) {
  return [...episodeList].sort((first, second) => {
    const firstNumber = getEpisodeNumber(first) ?? -1;
    const secondNumber = getEpisodeNumber(second) ?? -1;

    return secondNumber - firstNumber;
  });
}
