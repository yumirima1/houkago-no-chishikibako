"use client";

import { Episode } from "@/data/episodes";

type AudioPlayerProps = {
  episode: Episode;
  onPlaybackChange?: (isPlaying: boolean) => void;
};

export function AudioPlayer({
  episode,
  onPlaybackChange,
}: AudioPlayerProps) {
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
        </div>
        <p className="font-mono text-sm text-slate-300">{episode.duration}</p>
      </div>

      <audio
        key={episode.id}
        className="w-full accent-cyan-200"
        controls
        onEnded={() => onPlaybackChange?.(false)}
        onPause={() => onPlaybackChange?.(false)}
        onPlay={() => onPlaybackChange?.(true)}
        preload="metadata"
        src={episode.audioUrl}
      >
        お使いのブラウザは音声再生に対応していません。
      </audio>

      <p className="mt-4 text-sm leading-7 text-slate-300">
        {episode.description}
      </p>
    </section>
  );
}
