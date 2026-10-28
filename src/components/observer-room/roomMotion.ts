export const ROOM_CAMERA = { position: [0.25, 1.85, 2.9], target: [-0.25, 1.62, -2], fov: 64 } as const;
export const MONITOR_CAMERA = { position: [0.45, 1.65, 2.3], target: [0.37, 1.57, -0.44] } as const;

export function roomCameraPosition(x: number, y: number, aspect = 16 / 9, reducedMotion = false) {
  const clamp = (n: number) => Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));
  // Stay inside the room, including portrait screens. The phone supplies its own UI.
  const extraDistance = Math.min(0.25, Math.max(0, 1 / Math.max(0.25, aspect) - 1) * 0.2);
  return [ROOM_CAMERA.position[0] + (reducedMotion ? 0 : clamp(x) * 0.055),
    ROOM_CAMERA.position[1] + (reducedMotion ? 0 : clamp(y) * 0.035),
    ROOM_CAMERA.position[2] + extraDistance] as const;
}

export function roomCameraTarget(x: number, y: number, stationary = false) {
  const clamp = (n: number) => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  return [ROOM_CAMERA.target[0] + (stationary ? 0 : clamp(x) * 1.25),
    ROOM_CAMERA.target[1] + (stationary ? 0 : clamp(y) * 0.65), ROOM_CAMERA.target[2]] as const;
}

// The reset occurs beyond the window's visible frustum, never inside the room.
export function trainPosition(seconds: number) {
  return -45 + (((seconds * 1.45 + 29) % 80) + 80) % 80;
}

export function carPosition(seconds: number, index: number) {
  const direction = index % 2 ? -1 : 1;
  return -35 + ((((seconds * (1.6 + index * 0.13) * direction + 28 + index * 16) % 70) + 70) % 70);
}

export const PHONE_OPEN_MS = 1500;
export function phoneProgress(elapsedMs: number, opening: boolean) {
  const t = Math.max(0, Math.min(1, elapsedMs / (opening ? PHONE_OPEN_MS : 600)));
  const eased = t * t * (3 - 2 * t);
  return opening ? eased : 1 - eased;
}
