export type SubjectId = "tartar" | "kana";

export type RoomMode = "entry" | "listening" | "screensaver" | "room";

export type Relationship = {
  dependency: number;
  friendship: number;
  lastVisitedAt?: string;
  trust: number;
};

export type TimeBand = "late-night" | "night" | "morning" | "day";

export type SubjectAction = {
  ambientCue: string;
  broadcastHint: string;
  broadcastSeed: string;
  id: string;
  label: string;
  logText: string;
  mood: string;
  reaction: string;
  themeCandidate: string;
  thought: string;
  timeBands?: TimeBand[];
  trustLevel?: "early" | "familiar" | "close";
};

export type ObservationSubject = {
  accent: string;
  description: string;
  id: SubjectId;
  mood: string;
  name: string;
  roomObjects: RoomObject[];
  roomType: "tartar-room" | "kana-room";
  shortName: string;
};

export type RoomObjectId =
  | "crt"
  | "envelope"
  | "terminal"
  | "memo"
  | "window"
  | "lamp";

export type RoomObject = {
  id: RoomObjectId;
  label: string;
  description: string;
};

export type ObservationLog = {
  actionId: string;
  broadcastHint?: string;
  id: string;
  logText?: string;
  source: "visit" | "observe" | "room-object" | "dialogue";
  subjectId: SubjectId;
  themeCandidate?: string;
  thought: string;
  timestamp: string;
};

export type RelationshipAtmosphere = {
  dependencyLine: string;
  friendshipLine: string;
  headline: string;
  trustLine: string;
};

export type BroadcastThemeCandidate = {
  hint: string;
  id: string;
  source: ObservationLog["source"];
  theme: string;
  timestamp: string;
};
