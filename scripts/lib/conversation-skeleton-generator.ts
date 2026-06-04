import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  EpisodeSeedRarity,
  EpisodeSeed,
  generateEpisodeSeed,
} from "./episode-seed-generator";

export type ConversationSpeaker = "かな" | "タルタル" | "both";
export type ConversationEventKind =
  | "event"
  | "detour"
  | "accident"
  | "metaphor"
  | "thought_experiment"
  | "inside_joke"
  | "atmosphere"
  | "reality_reference"
  | "emotion"
  | "reaction";
export type ConversationBeatRole =
  | "hook"
  | "reception"
  | "analysis"
  | "question"
  | "reaction"
  | "event"
  | "atmosphere"
  | "turn"
  | "closing";
export type ConversationTemperature = "warm" | "normal" | "deep" | "funny" | "quiet";
export type ConversationTemperatureLevel = "low" | "medium" | "high";
export type ConversationClosingStyle = "soft" | "open" | "light";

export type ConversationBeat = {
  order: number;
  speaker: ConversationSpeaker;
  role: ConversationBeatRole;
  purpose: string;
  eventId?: string;
  eventKind?: ConversationEventKind;
  rarity?: EpisodeSeedRarity;
  cue: string;
  required?: boolean;
};

export type ConversationSkeleton = {
  theme: string;
  structureTemplate: string;
  conversationTemperature: ConversationTemperature;
  temperaturePlan: {
    explanation: ConversationTemperatureLevel;
    emotion: ConversationTemperatureLevel;
    humor: ConversationTemperatureLevel;
    detour: ConversationTemperatureLevel;
    silence: ConversationTemperatureLevel;
    closing: ConversationClosingStyle;
  };
  atmosphere: EpisodeSeed["atmosphere"];
  tone: EpisodeSeed["tone"];
  eventPlan: {
    selectedEventIds: string[];
    supportedEventKinds: ConversationEventKind[];
    rarityMix: EpisodeSeed["rarityMix"];
    notes: string[];
  };
  beats: ConversationBeat[];
};

type SeedEvent = {
  category?: string;
  correlation?: {
    avoidWith?: string[];
    pairsWellWith?: string[];
  };
  cooldownEpisodes?: number;
  description?: string;
  exampleBeat?: string;
  id: string;
  rarity: EpisodeSeedRarity;
  speakerBias?: string;
  temperatureBias?: Partial<Record<ConversationTemperature, number>>;
  type?: string;
  weight: number;
};

type StructureTemplate = {
  beats: string[];
  id: string;
  name?: string;
};

type GenerateConversationSkeletonOptions =
  | {
      seed: EpisodeSeed;
      theme?: never;
    }
  | {
      seed?: never;
      theme: string;
    };

const EVENTS_PATH = path.join(
  process.cwd(),
  "content",
  "episode-seed-engine",
  "events.json",
);
const STRUCTURE_TEMPLATES_PATH = path.join(
  process.cwd(),
  "content",
  "episode-seed-engine",
  "structure-templates.json",
);
const supportedEventKinds: ConversationEventKind[] = [
  "event",
  "detour",
  "accident",
  "metaphor",
  "thought_experiment",
  "inside_joke",
  "atmosphere",
  "reality_reference",
  "emotion",
  "reaction",
];

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function parseEvents(value: unknown): SeedEvent[] {
  if (!Array.isArray(value)) {
    throw new Error("events.json must contain an array.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`events[${index}] must be an object.`);
    }

    const event = item as Record<string, unknown>;

    assertString(event.id, `events[${index}].id`);

    return {
      category: typeof event.category === "string" ? event.category : undefined,
      correlation: parseCorrelation(event.correlation),
      cooldownEpisodes:
        typeof event.cooldownEpisodes === "number"
          ? event.cooldownEpisodes
          : undefined,
      description:
        typeof event.description === "string" ? event.description : undefined,
      exampleBeat:
        typeof event.exampleBeat === "string" ? event.exampleBeat : undefined,
      id: event.id,
      rarity:
        typeof event.rarity === "string"
          ? normalizeRarity(event.rarity)
          : "Common",
      speakerBias:
        typeof event.speakerBias === "string" ? event.speakerBias : undefined,
      temperatureBias: parseTemperatureBias(event.temperatureBias),
      type: typeof event.type === "string" ? event.type : undefined,
      weight: typeof event.weight === "number" ? Math.max(0, event.weight) : 1,
    };
  });
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parseCorrelation(value: unknown): SeedEvent["correlation"] {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const correlation = value as Record<string, unknown>;
  const pairsWellWith = parseStringArray(correlation.pairsWellWith);
  const avoidWith = parseStringArray(correlation.avoidWith);

  if (!pairsWellWith?.length && !avoidWith?.length) {
    return undefined;
  }

  return {
    ...(pairsWellWith?.length ? { pairsWellWith } : {}),
    ...(avoidWith?.length ? { avoidWith } : {}),
  };
}

function parseTemperatureBias(
  value: unknown,
): Partial<Record<ConversationTemperature, number>> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const entries = (["warm", "normal", "deep", "funny", "quiet"] as const)
    .map((temperature) => [temperature, source[temperature]] as const)
    .filter((entry): entry is readonly [ConversationTemperature, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
    );

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Partial<
    Record<ConversationTemperature, number>
  >;
}

function parseTemplates(value: unknown): StructureTemplate[] {
  if (!Array.isArray(value)) {
    throw new Error("structure-templates.json must contain an array.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`structureTemplates[${index}] must be an object.`);
    }

    const template = item as Record<string, unknown>;

    assertString(template.id, `structureTemplates[${index}].id`);

    if (!Array.isArray(template.beats)) {
      throw new Error(`structureTemplates[${index}].beats must be an array.`);
    }

    return {
      beats: template.beats.map((beat, beatIndex) => {
        assertString(
          beat,
          `structureTemplates[${index}].beats[${beatIndex}]`,
        );
        return beat;
      }),
      id: template.id,
      name: typeof template.name === "string" ? template.name : undefined,
    };
  });
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function speakerFromBias(bias: string | undefined): ConversationSpeaker {
  if (bias === "kana") {
    return "かな";
  }

  if (bias === "tartar") {
    return "タルタル";
  }

  return "both";
}

function normalizeRarity(rarity: string): EpisodeSeedRarity {
  const normalized = rarity.trim().toLowerCase();

  if (normalized === "rare") {
    return "Rare";
  }

  if (normalized === "epic") {
    return "Epic";
  }

  if (normalized === "legendary") {
    return "Legendary";
  }

  return "Common";
}

function normalizeEventKind(kind: string | undefined): ConversationEventKind {
  const normalized = (kind ?? "event").trim().toLowerCase().replace(/-/g, "_");

  if (normalized === "脱線" || normalized === "detour") {
    return "detour";
  }

  if (normalized === "事故" || normalized === "accident") {
    return "accident";
  }

  if (normalized === "例え" || normalized === "metaphor") {
    return "metaphor";
  }

  if (normalized === "思考実験" || normalized === "thought_experiment") {
    return "thought_experiment";
  }

  if (normalized === "内輪ネタ" || normalized === "inside_joke") {
    return "inside_joke";
  }

  if (normalized === "空気" || normalized === "atmosphere") {
    return "atmosphere";
  }

  if (normalized === "現実参照" || normalized === "reality_reference") {
    return "reality_reference";
  }

  if (normalized === "感情" || normalized === "emotion") {
    return "emotion";
  }

  if (normalized === "反応" || normalized === "reaction") {
    return "reaction";
  }

  return "event";
}

function eventKindFromEvent(event: SeedEvent) {
  return normalizeEventKind(event.type ?? event.category);
}

function roleFromEvent(event: SeedEvent): ConversationBeatRole {
  const eventKind = eventKindFromEvent(event);

  if (eventKind === "atmosphere") {
    return "atmosphere";
  }

  if (eventKind === "emotion" || eventKind === "reaction") {
    return "reaction";
  }

  return "event";
}

function purposeFromEvent(event: SeedEvent) {
  const eventKind = eventKindFromEvent(event);

  if (eventKind === "detour") {
    return "必要な回だけ、会話を横へずらして息を入れる";
  }

  if (eventKind === "metaphor") {
    return "変な例えで記憶に残す";
  }

  if (eventKind === "accident") {
    return "予定調和を崩して会話を生かす";
  }

  if (eventKind === "thought_experiment") {
    return "小さな仮定でテーマを横から見る";
  }

  if (eventKind === "inside_joke") {
    return "番組らしい軽い記憶を差し込む";
  }

  if (eventKind === "atmosphere") {
    return "一拍置いて深夜感を作る";
  }

  if (eventKind === "reality_reference") {
    return "抽象論を生活の手触りへ戻す";
  }

  if (eventKind === "emotion") {
    return "かなの気持ちを相槌で流さず、会話の重心にする";
  }

  if (eventKind === "reaction") {
    return "聞き手の反応で会話の向きを調整する";
  }

  return event.description ?? "Seed eventを会話の揺れとして入れる";
}

function cueFromEvent(event: SeedEvent) {
  if (event.exampleBeat) {
    return event.exampleBeat;
  }

  return event.description ?? `${event.id} を会話に差し込む`;
}

function cueFromTemplateBeat(beat: string, seed: EpisodeSeed) {
  const theme = seed.theme;

  if (beat.includes("日常") || beat.includes("部屋")) {
    return `${theme}を、生活の中でふと気になる場面から始める`;
  }

  if (beat.includes("受け止め")) {
    return "かなの違和感を一度受け止めてから、話を広げる";
  }

  if (beat.includes("理屈") || beat.includes("整理") || beat.includes("背景")) {
    return `${theme}を理屈で少しだけほどく`;
  }

  if (beat.includes("反論") || beat.includes("不安") || beat.includes("違和感")) {
    return "聞き手の側から、納得しきれない感じを出す";
  }

  if (beat.includes("脱線") || beat.includes("笑")) {
    return "小さく笑える方向へ一度ずらす";
  }

  if (beat.includes("戻") || beat.includes("閉じ") || beat.includes("余白")) {
    return "答えを決めきらず、少し考えが残るところで閉じる";
  }

  return beat;
}

function roleFromTemplateBeat(index: number, beat: string): ConversationBeatRole {
  if (index === 0) {
    return "hook";
  }

  if (beat.includes("受け止め")) {
    return "reception";
  }

  if (beat.includes("理屈") || beat.includes("整理") || beat.includes("背景")) {
    return "analysis";
  }

  if (beat.includes("疑問") || beat.includes("反論") || beat.includes("違和感")) {
    return "question";
  }

  if (beat.includes("脱線") || beat.includes("笑")) {
    return "turn";
  }

  if (beat.includes("閉じ") || beat.includes("余白") || beat.includes("戻")) {
    return "closing";
  }

  return "turn";
}

function speakerFromTemplateBeat(
  index: number,
  beat: string,
): ConversationSpeaker {
  if (beat.includes("二人") || beat.includes("どちら")) {
    return "both";
  }

  if (beat.includes("かな")) {
    return "かな";
  }

  if (beat.includes("タルタル")) {
    return "タルタル";
  }

  return index % 2 === 0 ? "かな" : "タルタル";
}

function purposeFromRole(role: ConversationBeatRole, seed: EpisodeSeed) {
  if (role === "hook") {
    return "生活感から話を始める";
  }

  if (role === "reception") {
    return "かなを無視せず、感情や違和感を受け止める";
  }

  if (role === "analysis") {
    return "テーマを理屈で広げる";
  }

  if (role === "question") {
    return "聞き手の違和感を出す";
  }

  if (role === "turn") {
    return "会話を少し横へずらす";
  }

  if (role === "closing") {
    return seed.tone === "melancholic"
      ? "余韻を残して静かに締める"
      : "優しく締める";
  }

  return "会話の流れを支える";
}

function inferConversationTemperature(
  seed: EpisodeSeed,
  selectedEvents: SeedEvent[],
): ConversationTemperature {
  const theme = seed.theme;
  const scores: Record<ConversationTemperature, number> = {
    deep: 0,
    funny: 0,
    normal: 1,
    quiet: 0,
    warm: 0,
  };

  if (/コンビニ|充電|バグ|赤シート|スプレー|Windows|いらない|変な|魔法/.test(theme)) {
    scores.funny += 3;
  }

  if (/検索履歴|ひとりごと|謝って|名前|孤独|怖|不安|相談|眠れない/.test(theme)) {
    scores.quiet += 3;
  }

  if (/時間|宇宙|理解|記憶|思い出|黒歴史|翻訳|正しさ|物語/.test(theme)) {
    scores.deep += 3;
  }

  if (
    /作る|創作|応援|マネタイズ|やさしく|未来|昔|秘密基地|疲れ|ニュース/.test(theme) ||
    seed.atmosphere === "warm" ||
    seed.tone === "optimistic"
  ) {
    scores.warm += 3;
  }

  if (seed.atmosphere === "playful") {
    scores.funny += 2;
  }

  if (seed.atmosphere === "quiet" || seed.tone === "melancholic") {
    scores.quiet += 2;
  }

  if (seed.atmosphere === "deep" || seed.atmosphere === "nostalgic") {
    scores.deep += 2;
  }

  if (seed.atmosphere === "rainy") {
    scores.quiet += 1;
    scores.warm += 1;
  }

  if (seed.tone === "skeptical") {
    scores.deep += 1;
  }

  if (seed.tone === "emotional") {
    scores.warm += 1;
    scores.quiet += 1;
  }

  for (const event of selectedEvents) {
    for (const [temperature, bias] of Object.entries(event.temperatureBias ?? {}) as Array<
      [ConversationTemperature, number]
    >) {
      scores[temperature] += bias - 1;
    }
  }

  return (Object.entries(scores) as Array<[ConversationTemperature, number]>).sort(
    ([leftTemperature, leftScore], [rightTemperature, rightScore]) =>
      rightScore - leftScore || leftTemperature.localeCompare(rightTemperature),
  )[0][0];
}

function describeTemperatureBias(
  selectedEvents: SeedEvent[],
  conversationTemperature: ConversationTemperature,
) {
  const biasedEvents = selectedEvents
    .filter((event) => typeof event.temperatureBias?.[conversationTemperature] === "number")
    .map((event) => `${event.id}:${event.temperatureBias?.[conversationTemperature]}`);

  if (biasedEvents.length === 0) {
    return "Conversation temperature is inferred from theme, atmosphere, and tone.";
  }

  return `Conversation temperature also reflects selected event bias (${biasedEvents.join(", ")}).`;
}

function describeCorrelation(selectedEvents: SeedEvent[]) {
  const selectedEventIds = new Set(selectedEvents.map((event) => event.id));
  const notes: string[] = [];

  for (const event of selectedEvents) {
    const paired = event.correlation?.pairsWellWith?.filter((eventId) =>
      selectedEventIds.has(eventId),
    );
    const avoided = event.correlation?.avoidWith?.filter((eventId) =>
      selectedEventIds.has(eventId),
    );

    if (paired?.length) {
      notes.push(`${event.id} pairs with ${paired.join(", ")}.`);
    }

    if (avoided?.length) {
      notes.push(`${event.id} conflicts with ${avoided.join(", ")}.`);
    }
  }

  return notes;
}

function temperaturePlanFor(temperature: ConversationTemperature) {
  if (temperature === "warm") {
    return {
      closing: "soft" as const,
      detour: "medium" as const,
      emotion: "high" as const,
      explanation: "medium" as const,
      humor: "medium" as const,
      silence: "medium" as const,
    };
  }

  if (temperature === "deep") {
    return {
      closing: "open" as const,
      detour: "low" as const,
      emotion: "high" as const,
      explanation: "medium" as const,
      humor: "low" as const,
      silence: "high" as const,
    };
  }

  if (temperature === "funny") {
    return {
      closing: "light" as const,
      detour: "high" as const,
      emotion: "medium" as const,
      explanation: "low" as const,
      humor: "high" as const,
      silence: "low" as const,
    };
  }

  if (temperature === "quiet") {
    return {
      closing: "soft" as const,
      detour: "low" as const,
      emotion: "high" as const,
      explanation: "low" as const,
      humor: "low" as const,
      silence: "high" as const,
    };
  }

  return {
    closing: "soft" as const,
    detour: "medium" as const,
    emotion: "medium" as const,
    explanation: "medium" as const,
    humor: "medium" as const,
    silence: "medium" as const,
  };
}

function templateBeatToConversationBeat(
  beat: string,
  index: number,
  seed: EpisodeSeed,
  hasSelectedDetour: boolean,
): Omit<ConversationBeat, "order"> {
  const role = roleFromTemplateBeat(index, beat);
  const speaker =
    role === "closing" && !beat.includes("二人") && !beat.includes("どちら")
      ? "タルタル"
      : speakerFromTemplateBeat(index, beat);
  const isDetourLike = beat.includes("脱線") || beat.includes("笑");

  return {
    cue:
      isDetourLike && !hasSelectedDetour
        ? "脱線を義務化せず、必要なら小さな反応や笑いに留める"
        : cueFromTemplateBeat(beat, seed),
    purpose:
      isDetourLike && !hasSelectedDetour
        ? "会話の余白を作る。ただし毎話の脱線は必須にしない"
        : purposeFromRole(role, seed),
    ...(isDetourLike ? { eventKind: "detour" as const, required: false } : {}),
    role,
    speaker,
  };
}

function eventToConversationBeat(
  event: SeedEvent,
): Omit<ConversationBeat, "order"> {
  const eventKind = eventKindFromEvent(event);

  return {
    cue: cueFromEvent(event),
    eventId: event.id,
    eventKind,
    purpose: purposeFromEvent(event),
    rarity: event.rarity,
    role: roleFromEvent(event),
    speaker: speakerFromBias(event.speakerBias),
  };
}

function chooseEventInsertIndex(
  templateBeatCount: number,
  eventIndex: number,
  eventCount: number,
) {
  if (templateBeatCount <= 2) {
    return 1;
  }

  const availableSlots = Math.max(1, templateBeatCount - 2);
  const ratio = (eventIndex + 1) / (eventCount + 1);

  return 1 + Math.min(availableSlots, Math.floor(ratio * availableSlots));
}

function ensureClosingBeat(
  beats: Array<Omit<ConversationBeat, "order">>,
  seed: EpisodeSeed,
): Array<Omit<ConversationBeat, "order">> {
  const lastBeat = beats[beats.length - 1];

  if (lastBeat?.role === "closing") {
    return beats;
  }

  const closingBeat: Omit<ConversationBeat, "order"> = {
    cue: `${seed.theme}に答えを出し切らず、少し人間っぽい弱さとして置いておく`,
    purpose: "優しく締める",
    role: "closing",
    speaker: "タルタル",
  };

  return [
    ...beats,
    closingBeat,
  ];
}

export async function generateConversationSkeleton(
  options: GenerateConversationSkeletonOptions,
): Promise<ConversationSkeleton> {
  const seed = options.seed ?? (await generateEpisodeSeed({ theme: options.theme }));
  const [events, templates] = await Promise.all([
    readJson(EVENTS_PATH).then(parseEvents),
    readJson(STRUCTURE_TEMPLATES_PATH).then(parseTemplates),
  ]);
  const template =
    templates.find((candidate) => candidate.id === seed.structureTemplate) ??
    templates[0];

  if (!template) {
    throw new Error("structure-templates.json must contain at least one template.");
  }

  const eventById = new Map(events.map((event) => [event.id, event]));
  const selectedEvents = seed.events
    .map((eventId) => eventById.get(eventId))
    .filter((event): event is SeedEvent => Boolean(event));
  const conversationTemperature = inferConversationTemperature(seed, selectedEvents);
  const temperaturePlan = temperaturePlanFor(conversationTemperature);
  const hasSelectedDetour = selectedEvents.some(
    (event) => eventKindFromEvent(event) === "detour",
  );
  const beatDrafts = template.beats.map((beat, index) =>
    templateBeatToConversationBeat(beat, index, seed, hasSelectedDetour),
  );

  selectedEvents.forEach((event, eventIndex) => {
    const insertIndex = chooseEventInsertIndex(
      template.beats.length,
      eventIndex,
      selectedEvents.length,
    );

    beatDrafts.splice(insertIndex + eventIndex, 0, eventToConversationBeat(event));
  });

  const beats = ensureClosingBeat(beatDrafts, seed).map((beat, index) => ({
    order: index + 1,
    speaker: beat.speaker,
    role: beat.role,
    purpose: beat.purpose,
    ...(beat.eventId ? { eventId: beat.eventId } : {}),
    ...(beat.eventKind ? { eventKind: beat.eventKind } : {}),
    ...(beat.rarity ? { rarity: beat.rarity } : {}),
    cue: beat.cue,
    ...(typeof beat.required === "boolean" ? { required: beat.required } : {}),
  }));

  return {
    theme: seed.theme,
    structureTemplate: seed.structureTemplate,
    conversationTemperature,
    temperaturePlan,
    atmosphere: seed.atmosphere,
    tone: seed.tone,
    eventPlan: {
      selectedEventIds: selectedEvents.map((event) => event.id),
      supportedEventKinds,
      rarityMix: seed.rarityMix,
      notes: [
        "Detour is optional: selected events may add it, but every episode should not be forced to detour.",
        "Event metadata carries weight, rarity, cooldown, temperature bias, and correlation prep; history-based cooldown is still a later phase.",
        describeTemperatureBias(selectedEvents, conversationTemperature),
        ...describeCorrelation(selectedEvents),
      ],
    },
    beats,
  };
}
