"use client";

import { useEffect, useState } from "react";

import {
  BackgroundMode,
  RainyNightBackground,
} from "@/components/RainyNightBackground";
import { Episode, getEpisodeNumberLabel } from "@/data/episodes";

const clockFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Tokyo",
});

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
  onShowInterface: () => void;
};

export function BackgroundModeOverlay({
  backgroundMode,
  currentTime,
  duration,
  episode,
  onShowInterface,
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
        mode={backgroundMode}
      />

      <section
        className="ambient-stage"
        aria-label="背景モードプレイヤー"
      >
        <AmbientClock />

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
      >
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
