export const ROOM_CAMERA = { position: [1.25, 1.85, 4.1], target: [-0.28, 1.64, -1.0] } as const;
export const MONITOR_CAMERA = { position: [0.4, 1.65, 2.3], target: [0.12, 1.57, -0.44] } as const;

export function roomCameraPosition(x: number, y: number, aspect = 16 / 9, reducedMotion = false) {
  const clamp = (n: number) => Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));
  const extraDistance = Math.max(0, 1.15 / Math.max(0.25, aspect) - 1) * 3.6;
  return [ROOM_CAMERA.position[0] + (reducedMotion ? 0 : clamp(x) * 0.055),
    ROOM_CAMERA.position[1] + (reducedMotion ? 0 : clamp(y) * 0.035),
    ROOM_CAMERA.position[2] + extraDistance] as const;
}

// The reset occurs beyond the window's visible frustum, never inside the room.
export function trainPosition(seconds: number) {
  return -20 + (((seconds * 1.45 + 9) % 46) + 46) % 46;
}
