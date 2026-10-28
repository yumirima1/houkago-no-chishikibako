export const WORKSTATION_Z = -0.45;
export const WORKSTATION_X = 0.25;
export const ROOM_SIZE = { left: -3.8, right: 3.8, back: -2, front: 3.4, height: 3.5 } as const;
export const WINDOW_OPENING = { left: -3.15, right: 0.95, bottom: 0.72, top: 3.25, glassZ: -1.94 } as const;
// Window, opening, stencil, rain and city share this local frame on the right wall.
// Local -Z points outdoors (+world X); local X runs along the side wall (+world Z).
export const WINDOW_FRAME = { position: [1.8, 0, 1.7], rotation: [0, -Math.PI / 2, 0] } as const;
export const WINDOW_WALL = { left: ROOM_SIZE.back - WINDOW_FRAME.position[2], right: ROOM_SIZE.front - WINDOW_FRAME.position[2] } as const;
export const STREET_LEVEL = -3.6;
export const VIADUCT_LEVEL = -0.55;
export const TRAFFIC_Z = -25;
export const TRAFFIC_ANGLE = -0.28;
