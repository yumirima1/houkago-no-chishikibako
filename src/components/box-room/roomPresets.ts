export type BoxRoomPresetId = "knowledge" | "observation" | "consultation";

export type BoxRoomLightingPhase = "late-night" | "morning" | "evening";

export type BoxRoomPreset = {
  id: BoxRoomPresetId;
  name: string;
  statusLabel: string;
  subtitle: string;
  accentColor: string;
  monitorGlow: string;
};

export const roomPresets: Record<BoxRoomPresetId, BoxRoomPreset> = {
  consultation: {
    accentColor: "#f9a8d4",
    id: "consultation",
    monitorGlow: "#f9a8d4",
    name: "よるの相談箱",
    statusLabel: "LISTENING",
    subtitle: "anonymous post status",
  },
  knowledge: {
    accentColor: "#7dd3fc",
    id: "knowledge",
    monitorGlow: "#86efac",
    name: "考察箱",
    statusLabel: "ON AIR",
    subtitle: "NOW PLAYING",
  },
  observation: {
    accentColor: "#c4b5fd",
    id: "observation",
    monitorGlow: "#c4b5fd",
    name: "観察箱",
    statusLabel: "OBSERVING",
    subtitle: "今日の観察",
  },
};

export function getLightingPhase(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Tokyo",
    }).format(date),
  );

  if (hour >= 5 && hour < 17) {
    return "morning";
  }

  if (hour >= 17 && hour < 22) {
    return "evening";
  }

  return "late-night";
}
