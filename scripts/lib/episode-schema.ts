export type SpeakerId = "rikei" | "bunkei";

export type VoiceId = "rikei" | "bunkei" | string;
export type EpisodeType =
  | "regular"
  | "special"
  | "news"
  | "movie"
  | "weather"
  | "anniversary";
export type EpisodeDurationType = "normal" | "long";

export type EpisodeSpeakerLine = {
  id: SpeakerId;
  name: string;
  voice: VoiceId;
  text: string;
};

export type ReviewResult = {
  reviewedAt: string;
  status: "reviewed";
  checks: {
    misinformationRisk: string;
    readability: string;
    roleSeparation: string;
    naturalConversation: string;
    narrationEase: string;
  };
  warnings: string[];
  changes: string[];
};

export type EpisodeScript = {
  id: string;
  title: string;
  theme: string;
  durationTargetMinutes: number;
  description: string;
  durationType?: EpisodeDurationType;
  tags?: string[];
  themes: string[];
  type?: EpisodeType;
  speakers: EpisodeSpeakerLine[];
  createdAt: string;
  updatedAt: string;
  review?: ReviewResult;
};

export type BuiltEpisode = {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  durationType: EpisodeDurationType;
  publishedAt: string;
  duration: string;
  tags: string[];
  themes: string[];
  type: EpisodeType;
  speakers: {
    science: string;
    humanities: string;
  };
  productionStatus: "published";
  source: {
    reviewedScriptPath: string;
    durationTargetMinutes: number;
    voices: Record<SpeakerId, VoiceId>;
  };
};

export function assertEpisodeScript(value: unknown): asserts value is EpisodeScript {
  if (!value || typeof value !== "object") {
    throw new Error("Episode script must be an object.");
  }

  const script = value as Partial<EpisodeScript>;
  const requiredStringFields = ["id", "title", "theme", "description"] as const;

  for (const field of requiredStringFields) {
    if (typeof script[field] !== "string" || !script[field]) {
      throw new Error(`Episode script is missing string field: ${field}`);
    }
  }

  if (
    typeof script.durationTargetMinutes !== "number" ||
    script.durationTargetMinutes <= 0
  ) {
    throw new Error("durationTargetMinutes must be a positive number.");
  }

  if (!Array.isArray(script.speakers) || script.speakers.length === 0) {
    throw new Error("speakers must be a non-empty array.");
  }

  for (const line of script.speakers) {
    if (
      !line ||
      typeof line !== "object" ||
      typeof line.id !== "string" ||
      typeof line.name !== "string" ||
      typeof line.voice !== "string" ||
      typeof line.text !== "string"
    ) {
      throw new Error("Each speaker line must include id, name, voice, and text.");
    }
  }
}
