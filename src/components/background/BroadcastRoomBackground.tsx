"use client";

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

export function BroadcastRoomBackground({
  className,
  isOnAir,
  mode,
  nowPlayingLabel,
}: BroadcastRoomBackgroundProps) {
  return (
    <RainyNightBackground
      className={className}
      isOnAir={isOnAir}
      mode={mode}
      nowPlayingLabel={nowPlayingLabel}
    />
  );
}
