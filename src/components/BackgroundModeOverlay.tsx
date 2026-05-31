"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BackgroundMode,
  RainyNightBackground,
} from "@/components/RainyNightBackground";
import {
  Episode,
  getEpisodeDurationLabel,
  getEpisodeProductionStatusLabel,
  getEpisodeTags,
  getEpisodeType,
  getEpisodeTypeLabel,
  hasPlayableAudio,
} from "@/data/episodes";

const clockFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Tokyo",
});

const modeLabels: Record<BackgroundMode, string> = {
  desk: "デスク",
  room: "夜の部屋",
  window: "雨の窓",
};

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

function AmbientClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const initialTick = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="ambient-clock" aria-label="現在時刻">
      <div className="ambient-clock-ring">
        <span className="clock-mark clock-mark-12" />
        <span className="clock-mark clock-mark-3" />
        <span className="clock-mark clock-mark-6" />
        <span className="clock-mark clock-mark-9" />
        <p className="ambient-clock-label">TOKYO</p>
        <time
          className="ambient-clock-time"
          dateTime={now?.toISOString()}
        >
          {now ? clockFormatter.format(now) : "--:--:--"}
        </time>
      </div>
    </div>
  );
}

type BackgroundModeOverlayProps = {
  backgroundMode: BackgroundMode;
  currentTime: number;
  duration: number;
  episode: Episode;
  hasNextEpisode: boolean;
  hasPreviousEpisode: boolean;
  isPlaying: boolean;
  isVisible: boolean;
  onChangeBackgroundMode: (mode: BackgroundMode) => void;
  onNextEpisode: () => void;
  onPreviousEpisode: () => void;
  onSeek: (value: number) => void;
  onSeekBy: (seconds: number) => void;
  onShowInterface: () => void;
  onToggleOverlay: () => void;
  onTogglePlayback: () => void;
};

export function BackgroundModeOverlay({
  backgroundMode,
  currentTime,
  duration,
  episode,
  hasNextEpisode,
  hasPreviousEpisode,
  isPlaying,
  isVisible,
  onChangeBackgroundMode,
  onNextEpisode,
  onPreviousEpisode,
  onSeek,
  onSeekBy,
  onShowInterface,
  onToggleOverlay,
  onTogglePlayback,
}: BackgroundModeOverlayProps) {
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);
  const displayDuration = duration > 0 ? duration : parseDuration(episode.duration);
  const progress = displayDuration
    ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))
    : 0;
  const tags = getEpisodeTags(episode);
  const typeLabel = getEpisodeTypeLabel(getEpisodeType(episode));
  const isPlayable = hasPlayableAudio(episode);
  const episodeNumber = useMemo(
    () => episode.id.replace(/^episode-/, "#").replace(/^#0+/, "#"),
    [episode.id],
  );

  return (
    <div
      className={`background-mode-overlay background-mode-overlay-${backgroundMode} ${
        isVisible ? "is-visible" : "is-dimmed"
      }`}
      onClick={(event) => {
        if (event.currentTarget === event.target) {
          onToggleOverlay();
        }
      }}
    >
      <RainyNightBackground
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#050812]"
        mode={backgroundMode}
      />

      <button
        className="ambient-show-ui"
        onClick={onShowInterface}
        type="button"
      >
        UIを表示
      </button>

      <nav
        className={`ambient-nav ${isModePickerOpen ? "is-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
        aria-label="背景モード内ナビゲーション"
      >
        <button
          className="ambient-nav-secondary"
          type="button"
        >
          エピソード一覧
        </button>
        <button
          className="ambient-nav-secondary"
          type="button"
        >
          タグから探す
        </button>
        <button
          aria-expanded={isModePickerOpen}
          className="ambient-mode-toggle"
          onClick={() => setIsModePickerOpen((isOpen) => !isOpen)}
          type="button"
        >
          背景を選ぶ
        </button>
        <div className="ambient-mode-buttons">
          {(Object.keys(modeLabels) as BackgroundMode[]).map((mode) => (
            <button
              className={mode === backgroundMode ? "is-active" : ""}
              key={mode}
              onClick={() => onChangeBackgroundMode(mode)}
              type="button"
            >
              {modeLabels[mode]}
            </button>
          ))}
        </div>
      </nav>

      <section
        className="ambient-stage"
        onClick={(event) => event.stopPropagation()}
        aria-label="背景モードプレイヤー"
      >
        <AmbientClock />

        <div className="ambient-episode">
          <p className="ambient-episode-number">
            {episodeNumber} {typeLabel}
          </p>
          <h2>{episode.title}</h2>
          <p className="ambient-episode-meta">
            {typeLabel} / {getEpisodeDurationLabel(episode)} / {episode.duration}
            {!isPlayable
              ? ` / ${getEpisodeProductionStatusLabel(episode.productionStatus)}`
              : ""}
          </p>
          <div className="ambient-tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      <section
        className="ambient-controls"
        onClick={(event) => event.stopPropagation()}
        aria-label="背景モード再生操作"
      >
        <div className="ambient-control-row">
          <button
            aria-label="前のエピソード"
            className="ambient-round-control"
            disabled={!hasPreviousEpisode}
            onClick={onPreviousEpisode}
            type="button"
          >
            前
          </button>
          <button
            aria-label="15秒戻す"
            className="ambient-round-control ambient-small-control"
            onClick={() => onSeekBy(-15)}
            type="button"
          >
            -15
          </button>
          <button
            aria-label={isPlaying ? "一時停止" : "再生"}
            className="ambient-play-control"
            disabled={!isPlayable}
            onClick={onTogglePlayback}
            type="button"
          >
            {!isPlayable ? "準備中" : isPlaying ? "一時停止" : "再生"}
          </button>
          <button
            aria-label="15秒送る"
            className="ambient-round-control ambient-small-control"
            onClick={() => onSeekBy(15)}
            type="button"
          >
            +15
          </button>
          <button
            aria-label="次のエピソード"
            className="ambient-round-control"
            disabled={!hasNextEpisode}
            onClick={onNextEpisode}
            type="button"
          >
            次
          </button>
        </div>

        <div className="ambient-progress-shell">
          <span className="ambient-progress-time">{formatTime(currentTime)}</span>
          <label className="ambient-progress">
            <span className="sr-only">再生位置</span>
            <span
              className="ambient-progress-fill"
              style={{ width: `${progress}%` }}
            />
            <input
              max={displayDuration || 0}
              min={0}
              disabled={!isPlayable}
              onChange={(event) => onSeek(Number(event.currentTarget.value))}
              step={1}
              type="range"
              value={Math.min(currentTime, displayDuration || 0)}
            />
          </label>
          <span className="ambient-progress-time">
            {formatTime(displayDuration)}
          </span>
        </div>
      </section>
    </div>
  );
}
