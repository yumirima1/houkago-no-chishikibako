export type SubjectId = "tartar" | "kana";

export type RoomMode = "entry" | "listening" | "screensaver" | "room";

export type Relationship = {
  dependency: number;
  friendship: number;
  lastVisitedAt?: string;
  trust: number;
};

export type SubjectAction = {
  broadcastSeed: string;
  id: string;
  label: string;
  logText: string;
  thought: string;
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
  id: string;
  source: "visit" | "observe" | "room-object" | "dialogue";
  subjectId: SubjectId;
  thought: string;
  timestamp: string;
};

