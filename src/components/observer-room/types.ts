export type ObserverHotspotId =
  | "desk-notes"
  | "pc-workstation"
  | "monitor-display"
  | "pinboard"
  | "bookshelf"
  | "radio-audio"
  | "bed-rest"
  | "window"
  | "plant";

export type CameraPresetId =
  | "overview"
  | "desk"
  | "pc"
  | "bed"
  | "pinboard"
  | "bookshelf"
  | "window";

export type ObserverActivityState =
  | "resting"    // 休息中（ベッド・静寂）
  | "reading"    // 読書中（本棚・文献調査）
  | "gathering"  // 情報収集・検索中（PC・モニター）
  | "thinking";  // 思考・考察中（机・ノート）

export type TimeOfDay = "morning" | "afternoon" | "dusk" | "night";

export type ObserverJobStatus =
  | "running"
  | "thinking"
  | "idle"
  | "verifying"
  | "completed";

export type ObserverResearchNote = {
  id: string;
  title: string;
  topic: string;
  date: string;
  status: "verified" | "hypothetical" | "draft";
  summary: string;
  markdown: string;
  evidenceCount: number;
  sources: string[];
};

export type ObserverKnowledgeSource = {
  id: string;
  name: string;
  category: "natural_science" | "philosophy" | "history" | "technology";
  itemCount: number;
  lastChecked: string;
  relevance: number;
};

export type ObserverJobItem = {
  id: string;
  title: string;
  stage: string;
  status: ObserverJobStatus;
  timestamp: string;
  progressPercent: number;
};

export type OpenQuestionItem = {
  id: string;
  question: string;
  category: string;
  originDate: string;
  hypothesisDraft: string;
  status: "unresolved" | "investigating" | "synthesized";
};

export type MemoryExperienceItem = {
  id: string;
  title: string;
  date: string;
  description: string;
  tag: string;
  color: string;
};

export type MonitorNewsItem = {
  id: string;
  title: string;
  source: string;
  time: string;
  summary: string;
  relatedTopic: string;
};

export type RadioBroadcastInfo = {
  station: string;
  frequency: string;
  currentEpisode: string;
  status: "on-air" | "standby";
  description: string;
};

export type ObserverRoomState = {
  observer: {
    name: string;
    activity: ObserverActivityState;
    activityLabel: string;
    currentThought: string;
    lastActiveAt: string;
  };
  timeOfDay: TimeOfDay;
  growth: {
    knowledgeLevel: number; // 1〜5
    noteCount: number;
    memoryCount: number;
    unresolvedCount: number;
  };
  currentNote: ObserverResearchNote;
  notes: ObserverResearchNote[];
  sources: ObserverKnowledgeSource[];
  jobs: ObserverJobItem[];
  openQuestions: OpenQuestionItem[];
  experiences: MemoryExperienceItem[];
  news: MonitorNewsItem[];
  radio: RadioBroadcastInfo;
  ambient: {
    timeLabel: string;
    weather: string;
    windowNote: string;
    plantNote: string;
    bedNote: string;
  };
};
