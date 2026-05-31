"use client";

import type { RefObject } from "react";

import {
  Episode,
  getEpisodeDurationLabel,
  getEpisodeTags,
  getEpisodeType,
  getEpisodeTypeLabel,
} from "@/data/episodes";

type AudioPlayerProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  episode: Episode;
  onEnded?: () => void;
  onLoadedMetadata?: (duration: number) => void;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onTimeUpdate?: (currentTime: number) => void;
};

export function AudioPlayer({
  audioRef,
  episode,
  onEnded,
  onLoadedMetadata,
  onPlaybackChange,
  onTimeUpdate,
}: AudioPlayerProps) {
  const episodeType = getEpisodeType(episode);

  return (
    <section
      className="rounded-lg border border-white/10 bg-slate-950/72 p-5 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-6"
      aria-label="音声プレイヤー"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
            Now playing
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug text-slate-50 sm:text-2xl">
            {episode.title}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-100/20 bg-cyan-100/[0.1] px-2.5 py-1 text-xs text-cyan-50">
              {getEpisodeTypeLabel(episodeType)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">
              {getEpisodeDurationLabel(episode)}
            </span>
          </div>
        </div>
        <p className="font-mono text-sm text-slate-300">{episode.duration}</p>
      </div>

      <audio
        key={episode.id}
        ref={audioRef}
        className="w-full accent-cyan-200"
        controls
        onEnded={() => {
          onPlaybackChange?.(false);
          onEnded?.();
        }}
        onLoadedMetadata={(event) =>
          onLoadedMetadata?.(event.currentTarget.duration)
        }
        onPause={() => onPlaybackChange?.(false)}
        onPlay={() => onPlaybackChange?.(true)}
        onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
        preload="metadata"
        src={episode.audioUrl}
      >
        お使いのブラウザは音声再生に対応していません。
      </audio>

      <p className="mt-4 rounded-md border border-white/10 bg-white/[0.045] p-4 text-sm leading-7 text-slate-200">
        {episode.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {getEpisodeTags(episode).map((tag) => (
          <span
            className="rounded-full border border-cyan-100/15 bg-cyan-100/10 px-2.5 py-1 text-xs text-cyan-100"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}
