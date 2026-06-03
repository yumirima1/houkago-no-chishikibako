"use client";

import { BoxRoomLightingPhase } from "@/components/box-room/roomPresets";

type BoxRoomOverlayProps = {
  clockLabel: string;
  isOnAir: boolean;
  lightingPhase: BoxRoomLightingPhase;
  nowPlayingLabel: string;
};

const phaseLabels: Record<BoxRoomLightingPhase, string> = {
  evening: "EVENING LIGHT",
  "late-night": "LATE NIGHT",
  morning: "MORNING QUIET",
};

export function BoxRoomOverlay({
  clockLabel,
  isOnAir,
  lightingPhase,
  nowPlayingLabel,
}: BoxRoomOverlayProps) {
  return (
    <div className="box-room-overlay" aria-hidden="true">
      <div className="box-room-overlay-monitor">
        <span className="box-room-overlay-clock">{clockLabel}</span>
        <span className={isOnAir ? "is-live" : ""}>
          {isOnAir ? "● ON AIR" : "OFF AIR"}
        </span>
        <span>NOW PLAYING</span>
        <span>{nowPlayingLabel}</span>
      </div>
      <div className="box-room-overlay-phase">{phaseLabels[lightingPhase]}</div>
    </div>
  );
}
