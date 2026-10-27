// Pull back just enough to include the bed, chair and TV alongside the existing desk.
export const ROOM_CAMERA = { position: [4.2, 3.35, 7.8], target: [-0.2, 1.35, 0] } as const;
export const MONITOR_CAMERA = { position: [0.4, 1.65, 2.3], target: [0.12, 1.57, -0.44] } as const;

export function roomCameraPosition(x: number, y: number, aspect = 16 / 9, reducedMotion = false) {
  const clamp = (n: number) => Math.max(-1, Math.min(1, Number.isFinite(n) ? n : 0));
  const extraDistance = Math.max(0, 1 / Math.max(0.25, aspect) - 1) * 12;
  return [ROOM_CAMERA.position[0] + (reducedMotion ? 0 : clamp(x) * 0.055),
    ROOM_CAMERA.position[1] + (reducedMotion ? 0 : clamp(y) * 0.035),
    ROOM_CAMERA.position[2] + extraDistance] as const;
}

// The reset occurs beyond the window's visible frustum, never inside the room.
export function trainPosition(seconds: number) {
  return -20 + (((seconds * 1.45 + 9) % 46) + 46) % 46;
}
