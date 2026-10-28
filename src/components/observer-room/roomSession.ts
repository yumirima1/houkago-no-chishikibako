export type RoomSession = { windowOpen: boolean; musicWanted: boolean };

// A quiet room is a little more likely to have its window closed; music is often on.
// Draw once after hydration. UI changes never draw another initial state.
export function chooseRoomSession(windowDraw: number, musicDraw: number): RoomSession {
  return { windowOpen: windowDraw < 0.4, musicWanted: musicDraw < 0.6 };
}
export function createRoomSession(): RoomSession {
  const draws = crypto.getRandomValues(new Uint32Array(2));
  return chooseRoomSession(draws[0] / 4294967296, draws[1] / 4294967296);
}
