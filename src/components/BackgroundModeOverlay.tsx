"use client";

import {
  BackgroundMode,
  RainyNightBackground,
} from "@/components/RainyNightBackground";
import { Episode, getEpisodeNumberLabel } from "@/data/episodes";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function parseDuration(duration: string) {
  const [minutes = "0", seconds = "0"] = duration.split(":");
  return Number(minutes) * 60 + Number(seconds);
}

type BackgroundModeOverlayProps = {
  backgroundMode: BackgroundMode;
  canPlay: boolean;
  currentTime: number;
  duration: number;
  episode: Episode;
  isPlaying: boolean;
  onShowInterface: () => void;
  onTogglePlayback: () => void;
};

export function BackgroundModeOverlay({
  backgroundMode,
  canPlay,
  currentTime,
  duration,
  episode,
  isPlaying,
  onShowInterface,
  onTogglePlayback,
}: BackgroundModeOverlayProps) {
  const displayDuration = duration > 0 ? duration : parseDuration(episode.duration);
  const progress = displayDuration
    ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))
    : 0;
  const episodeNumberLabel = getEpisodeNumberLabel(episode);

  return (
    <div
      className={`background-mode-overlay background-mode-overlay-${backgroundMode}`}
      onClick={onShowInterface}
    >
      <RainyNightBackground
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#050812]"
        isOnAir={isPlaying}
        mode={backgroundMode}
        nowPlayingLabel={`${episodeNumberLabel} ${episode.title}`}
      />

      <section
        className="ambient-stage"
        aria-label="背景モードプレイヤー"
      >
        <div className="ambient-episode">
          <p className="ambient-episode-number">
            NOW PLAYING / {episodeNumberLabel}
          </p>
          <h2>{episode.title}</h2>
        </div>
      </section>

      <section
        className="ambient-controls"
        aria-label="背景モード再生状況"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ambient-control-row">
          <button
            aria-label={isPlaying ? "一時停止" : "再生"}
            className="ambient-play-control"
            disabled={!canPlay}
            onClick={onTogglePlayback}
            type="button"
          >
            {isPlaying ? "一時停止" : "再生"}
          </button>
        </div>

        <div className="ambient-progress-shell">
          <span className="ambient-progress-time">{formatTime(currentTime)}</span>
          <div className="ambient-progress" aria-hidden="true">
            <span
              className="ambient-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="ambient-progress-time">
            {formatTime(displayDuration)}
          </span>
        </div>
      </section>
    </div>
  );
}
