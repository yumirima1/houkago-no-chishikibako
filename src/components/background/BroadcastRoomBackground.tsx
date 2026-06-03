"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { BoxRoomOverlay } from "@/components/box-room/BoxRoomOverlay";
import {
  BoxRoomLightingPhase,
  getLightingPhase,
} from "@/components/box-room/roomPresets";
import {
  BackgroundMode,
  RainyNightBackground,
} from "@/components/RainyNightBackground";

type BroadcastRoomBackgroundProps = {
  className?: string;
  isOnAir: boolean;
  mode: BackgroundMode;
  nowPlayingLabel: string;
};

const BoxRoomScene = dynamic(
  () => import("@/components/box-room/BoxRoomScene"),
  {
    loading: () => null,
    ssr: false,
  },
);

function formatClockLabel(date: Date | null) {
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

function shouldEnable3d() {
  if (typeof window === "undefined") {
    return false;
  }

  const isSmallScreen = window.matchMedia("(max-width: 430px)").matches;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (isSmallScreen || prefersReducedMotion) {
    return false;
  }

  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("webgl2") ?? canvas.getContext("webgl");

  return Boolean(context);
}

export function BroadcastRoomBackground({
  className,
  isOnAir,
  mode,
  nowPlayingLabel,
}: BroadcastRoomBackgroundProps) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [is3dEnabled, setIs3dEnabled] = useState(false);
  const [lightingPhase, setLightingPhase] =
    useState<BoxRoomLightingPhase>("late-night");

  useEffect(() => {
    const tick = () => {
      const nextNow = new Date();

      setNow(nextNow);
      setLightingPhase(getLightingPhase(nextNow));
    };
    const mediaQuery = window.matchMedia("(max-width: 430px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update3d = () => setIs3dEnabled(shouldEnable3d());

    tick();
    update3d();

    const timer = window.setInterval(tick, 1000);

    mediaQuery.addEventListener("change", update3d);
    motionQuery.addEventListener("change", update3d);

    return () => {
      window.clearInterval(timer);
      mediaQuery.removeEventListener("change", update3d);
      motionQuery.removeEventListener("change", update3d);
    };
  }, []);

  const clockLabel = formatClockLabel(now);

  return (
    <div className={className}>
      <RainyNightBackground
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#050812]"
        isOnAir={isOnAir}
        mode={mode}
        nowPlayingLabel={nowPlayingLabel}
        showCrtMonitor={false}
      />
      <div
        className={`box-room-3d-layer ${
          is3dEnabled ? "is-enabled" : "is-disabled"
        }`}
      >
        {is3dEnabled ? (
          <BoxRoomScene
            clockLabel={clockLabel}
            isOnAir={isOnAir}
            lightingPhase={lightingPhase}
            mode="knowledge"
            title={nowPlayingLabel}
          />
        ) : null}
      </div>
      <BoxRoomOverlay
        clockLabel={clockLabel}
        isOnAir={isOnAir}
        lightingPhase={lightingPhase}
        nowPlayingLabel={nowPlayingLabel}
      />
    </div>
  );
}
