"use client";

import { useEffect, useState } from "react";

export type BackgroundMode = "room" | "desk" | "window";

export const backgroundModeProfiles: Array<{
  id: BackgroundMode;
  imageUrl: string;
  label: string;
  tags: string[];
}> = [
  {
    id: "room",
    imageUrl: "/backgrounds/lofi-pc-room.png",
    label: "雨の夜",
    tags: ["AI", "コンピュータ", "プログラミング", "Web開発", "ローカルAI"],
  },
  {
    id: "desk",
    imageUrl: "/backgrounds/lofi-pc-room.png",
    label: "星の夜",
    tags: ["心理学", "哲学", "相談", "ものづくり"],
  },
  {
    id: "window",
    imageUrl: "/backgrounds/lofi-pc-room.png",
    label: "曇りの夜",
    tags: ["科学", "宇宙", "言語", "物語", "知識ラジオ"],
  },
];

export function getBackgroundModeLabel(mode: BackgroundMode) {
  return (
    backgroundModeProfiles.find((profile) => profile.id === mode)?.label ?? mode
  );
}

export function getBackgroundModeForTags(tags: string[]) {
  return (
    backgroundModeProfiles.find((profile) =>
      profile.tags.some((tag) => tags.includes(tag)),
    )?.id ?? "room"
  );
}

type RainyNightBackgroundProps = {
  className?: string;
  isOnAir?: boolean;
  mode: BackgroundMode;
  nowPlayingLabel?: string;
  showCrtMonitor?: boolean;
};

function formatMonitorTime(date: Date | null) {
  if (!date) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function BroadcastCrtMonitor({
  isOnAir = false,
  nowPlayingLabel = "放課後の知識箱",
}: {
  isOnAir?: boolean;
  nowPlayingLabel?: string;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

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
    <div className="broadcast-crt-monitor" aria-hidden="true">
      <div className="broadcast-crt-shell">
        <div className="broadcast-crt-screen">
          <div className="broadcast-crt-scanlines" />
          <div className="broadcast-crt-noise" />
          <p className="broadcast-crt-time">{formatMonitorTime(now)}</p>
          <p
            className={`broadcast-crt-status ${
              isOnAir ? "broadcast-crt-status-live" : ""
            }`}
          >
            {isOnAir ? "● ON AIR" : "OFF AIR"}
          </p>
          <p className="broadcast-crt-label">NOW PLAYING</p>
          <p className="broadcast-crt-title">{nowPlayingLabel}</p>
        </div>
        <span className="broadcast-crt-led" />
      </div>
    </div>
  );
}

export function RainyNightBackground({
  className = "pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050812]",
  isOnAir = false,
  mode,
  nowPlayingLabel,
  showCrtMonitor = true,
}: RainyNightBackgroundProps) {
  const profile =
    backgroundModeProfiles.find((backgroundProfile) => backgroundProfile.id === mode) ??
    backgroundModeProfiles[0];

  return (
    <div className={className}>
      <div className={`night-scene night-scene-${mode}`} />
      <div
        className={`night-scene-image night-scene-image-${mode}`}
        style={{ backgroundImage: `url(${profile.imageUrl})` }}
      />
      <div className={`night-scene-atmosphere night-scene-atmosphere-${mode}`} />
      <div className="lofi-vignette" />
      {mode === "room" ? (
        <>
          <div className={`rainy-lines rainy-lines-${mode}`} />
          <div className={`rain-drops rain-drops-${mode}`} />
        </>
      ) : null}
      {mode === "desk" ? <div className="star-field" /> : null}
      {mode === "window" ? <div className="cloud-layer" /> : null}
      <div className={`station-curtain station-curtain-${mode}`} />
      <div className={`broadcast-light broadcast-light-${mode}`} />
      <div className={`lamp-spill lamp-spill-${mode}`} />
      <div className={`window-reflection window-reflection-${mode}`} />
      <div className={`window-glow-layer window-glow-layer-${mode}`} />
      {mode === "desk" ? (
        <div className="steam-layer steam-layer-desk">
          <span className="steam steam-a" />
          <span className="steam steam-b" />
          <span className="steam steam-c" />
        </div>
      ) : null}
      {showCrtMonitor ? (
        <BroadcastCrtMonitor
          isOnAir={isOnAir}
          nowPlayingLabel={nowPlayingLabel}
        />
      ) : null}
      <div className="room-grain" />
      <div className="night-floor" />
    </div>
  );
}
