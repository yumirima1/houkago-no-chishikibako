import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  EpisodeSeed,
  generateEpisodeSeed,
} from "./episode-seed-generator";

export type ConversationSpeaker = "かな" | "タルタル" | "both";
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

export type ConversationBeat = {
  order: number;
  speaker: ConversationSpeaker;
  role: ConversationBeatRole;
  purpose: string;
  eventId?: string;
  cue: string;
};

export type ConversationSkeleton = {
  theme: string;
  structureTemplate: string;
  atmosphere: EpisodeSeed["atmosphere"];
  tone: EpisodeSeed["tone"];
  beats: ConversationBeat[];
};

type SeedEvent = {
  category?: string;
  description?: string;
  exampleBeat?: string;
  id: string;
  speakerBias?: string;
  type?: string;
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
      description:
        typeof event.description === "string" ? event.description : undefined,
      exampleBeat:
        typeof event.exampleBeat === "string" ? event.exampleBeat : undefined,
      id: event.id,
      speakerBias:
        typeof event.speakerBias === "string" ? event.speakerBias : undefined,
      type: typeof event.type === "string" ? event.type : undefined,
    };
  });
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

function roleFromEvent(event: SeedEvent): ConversationBeatRole {
  const category = event.category ?? event.type;

  if (category === "空気") {
    return "atmosphere";
  }

  return "event";
}

function purposeFromEvent(event: SeedEvent) {
  const category = event.category ?? event.type;

  if (category === "例え") {
    return "変な例えで記憶に残す";
  }

  if (category === "事故") {
    return "予定調和を崩して会話を生かす";
  }

  if (category === "思考実験") {
    return "小さな仮定でテーマを横から見る";
  }

  if (category === "内輪ネタ") {
    return "番組らしい軽い記憶を差し込む";
  }

  if (category === "空気") {
    return "一拍置いて深夜感を作る";
  }

  if (category === "現実参照") {
    return "抽象論を生活の手触りへ戻す";
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

function templateBeatToConversationBeat(
  beat: string,
  index: number,
  seed: EpisodeSeed,
): Omit<ConversationBeat, "order"> {
  const role = roleFromTemplateBeat(index, beat);
  const speaker =
    role === "closing" && !beat.includes("二人") && !beat.includes("どちら")
      ? "タルタル"
      : speakerFromTemplateBeat(index, beat);

  return {
    cue: cueFromTemplateBeat(beat, seed),
    purpose: purposeFromRole(role, seed),
    role,
    speaker,
  };
}

function eventToConversationBeat(
  event: SeedEvent,
): Omit<ConversationBeat, "order"> {
  return {
    cue: cueFromEvent(event),
    eventId: event.id,
    purpose: purposeFromEvent(event),
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
  const beatDrafts = template.beats.map((beat, index) =>
    templateBeatToConversationBeat(beat, index, seed),
  );

  seed.events.forEach((eventId, eventIndex) => {
    const event = eventById.get(eventId);

    if (!event) {
      return;
    }

    const insertIndex = chooseEventInsertIndex(
      template.beats.length,
      eventIndex,
      seed.events.length,
    );

    beatDrafts.splice(insertIndex + eventIndex, 0, eventToConversationBeat(event));
  });

  const beats = ensureClosingBeat(beatDrafts, seed).map((beat, index) => ({
    order: index + 1,
    speaker: beat.speaker,
    role: beat.role,
    purpose: beat.purpose,
    ...(beat.eventId ? { eventId: beat.eventId } : {}),
    cue: beat.cue,
  }));

  return {
    theme: seed.theme,
    structureTemplate: seed.structureTemplate,
    atmosphere: seed.atmosphere,
    tone: seed.tone,
    beats,
  };
}
