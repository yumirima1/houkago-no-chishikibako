import { readFile } from "node:fs/promises";
import path from "node:path";

export type EpisodeSeedRarity = "Common" | "Rare" | "Epic" | "Legendary";
export type EpisodeSeedAtmosphere =
  | "quiet"
  | "warm"
  | "deep"
  | "mysterious"
  | "playful"
  | "serious"
  | "nostalgic"
  | "rainy";
export type EpisodeSeedTone =
  | "curious"
  | "skeptical"
  | "emotional"
  | "analytical"
  | "optimistic"
  | "melancholic";
export type EpisodeSeedTemperature = "warm" | "normal" | "deep" | "funny" | "quiet";

export type EpisodeSeed = {
  theme: string;
  structureTemplate: string;
  events: string[];
  atmosphere: EpisodeSeedAtmosphere;
  tone: EpisodeSeedTone;
  rarityMix: Record<EpisodeSeedRarity, number>;
};

type SeedEvent = {
  category?: string;
  correlation?: {
    avoidWith?: string[];
    pairsWellWith?: string[];
  };
  cooldownEpisodes?: number;
  description?: string;
  id: string;
  rarity: string;
  temperatureBias?: Partial<Record<EpisodeSeedTemperature, number>>;
  type?: string;
  weight: number;
};

type StructureTemplate = {
  id: string;
  name?: string;
};

type GenerateEpisodeSeedOptions = {
  eventCount?: number;
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

const atmosphereCandidates: EpisodeSeedAtmosphere[] = [
  "quiet",
  "warm",
  "deep",
  "mysterious",
  "playful",
  "serious",
  "nostalgic",
  "rainy",
];
const toneCandidates: EpisodeSeedTone[] = [
  "curious",
  "skeptical",
  "emotional",
  "analytical",
  "optimistic",
  "melancholic",
];
const defaultRarityMix: Record<EpisodeSeedRarity, number> = {
  Common: 0.7,
  Epic: 0.08,
  Legendary: 0.02,
  Rare: 0.2,
};

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function normalizeRarity(rarity: string): EpisodeSeedRarity {
  const normalized = rarity.trim().toLowerCase();

  if (normalized === "common" || normalized === "uncommon") {
    return "Common";
  }

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

function parseSeedEvents(value: unknown): SeedEvent[] {
  if (!Array.isArray(value)) {
    throw new Error("events.json must contain an array.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`events[${index}] must be an object.`);
    }

    const event = item as Record<string, unknown>;

    assertString(event.id, `events[${index}].id`);
    assertString(event.rarity, `events[${index}].rarity`);
    assertNumber(event.weight, `events[${index}].weight`);

    return {
      category:
        typeof event.category === "string"
          ? event.category
          : typeof event.type === "string"
            ? event.type
            : undefined,
      correlation: parseCorrelation(event.correlation),
      cooldownEpisodes:
        typeof event.cooldownEpisodes === "number"
          ? event.cooldownEpisodes
          : undefined,
      description:
        typeof event.description === "string" ? event.description : undefined,
      id: event.id,
      rarity: event.rarity,
      temperatureBias: parseTemperatureBias(event.temperatureBias),
      type: typeof event.type === "string" ? event.type : undefined,
      weight: Math.max(0, event.weight),
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
): Partial<Record<EpisodeSeedTemperature, number>> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const entries = (["warm", "normal", "deep", "funny", "quiet"] as const)
    .map((temperature) => [temperature, source[temperature]] as const)
    .filter((entry): entry is readonly [EpisodeSeedTemperature, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
    );

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Partial<
    Record<EpisodeSeedTemperature, number>
  >;
}

function parseStructureTemplates(value: unknown): StructureTemplate[] {
  if (!Array.isArray(value)) {
    throw new Error("structure-templates.json must contain an array.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`structureTemplates[${index}] must be an object.`);
    }

    const template = item as Record<string, unknown>;

    assertString(template.id, `structureTemplates[${index}].id`);

    return {
      id: template.id,
      name: typeof template.name === "string" ? template.name : undefined,
    };
  });
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function pickWeighted<T>(
  items: T[],
  getWeight: (item: T) => number,
  random = Math.random,
) {
  const totalWeight = items.reduce(
    (total, item) => total + Math.max(0, getWeight(item)),
    0,
  );

  if (items.length === 0) {
    throw new Error("Cannot pick from an empty list.");
  }

  if (totalWeight <= 0) {
    return items[Math.floor(random() * items.length)];
  }

  let cursor = random() * totalWeight;

  for (const item of items) {
    cursor -= Math.max(0, getWeight(item));

    if (cursor <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

function pickRarity(random = Math.random): EpisodeSeedRarity {
  const entries = Object.entries(defaultRarityMix) as Array<
    [EpisodeSeedRarity, number]
  >;

  return pickWeighted(entries, ([, weight]) => weight, random)[0];
}

function pickEventByRarity(
  events: SeedEvent[],
  rarity: EpisodeSeedRarity,
  excludedIds: Set<string>,
) {
  const candidates = events.filter(
    (event) => normalizeRarity(event.rarity) === rarity && !excludedIds.has(event.id),
  );

  if (candidates.length > 0) {
    return pickWeighted(candidates, (event) => event.weight);
  }

  const fallbackCandidates = events.filter((event) => !excludedIds.has(event.id));

  return pickWeighted(fallbackCandidates, (event) => event.weight);
}

function chooseAtmosphere(theme: string) {
  if (theme.includes("雨")) {
    return "rainy";
  }

  if (theme.includes("夜") || theme.includes("深夜")) {
    return "deep";
  }

  if (theme.includes("思い出") || theme.includes("記憶")) {
    return "nostalgic";
  }

  return pickWeighted(
    atmosphereCandidates,
    (atmosphere) => (atmosphere === "rainy" || atmosphere === "quiet" ? 2 : 1),
  );
}

function chooseTone(theme: string) {
  if (theme.includes("なぜ") || theme.includes("何")) {
    return "curious";
  }

  if (theme.includes("悪い") || theme.includes("怖")) {
    return "skeptical";
  }

  if (theme.includes("寂") || theme.includes("不安")) {
    return "emotional";
  }

  return pickWeighted(
    toneCandidates,
    (tone) => (tone === "curious" || tone === "analytical" ? 2 : 1),
  );
}

export async function generateEpisodeSeed({
  eventCount = 3,
  theme,
}: GenerateEpisodeSeedOptions): Promise<EpisodeSeed> {
  const trimmedTheme = theme.trim();

  assertString(trimmedTheme, "theme");

  const [events, structureTemplates] = await Promise.all([
    readJson(EVENTS_PATH).then(parseSeedEvents),
    readJson(STRUCTURE_TEMPLATES_PATH).then(parseStructureTemplates),
  ]);

  if (events.length === 0) {
    throw new Error("events.json must contain at least one event.");
  }

  if (structureTemplates.length === 0) {
    throw new Error("structure-templates.json must contain at least one template.");
  }

  const selectedEventIds = new Set<string>();
  const selectedEvents: string[] = [];
  const safeEventCount = Math.max(1, Math.min(eventCount, events.length));

  for (let index = 0; index < safeEventCount; index += 1) {
    const event = pickEventByRarity(events, pickRarity(), selectedEventIds);

    selectedEventIds.add(event.id);
    selectedEvents.push(event.id);
  }

  return {
    theme: trimmedTheme,
    structureTemplate: pickWeighted(
      structureTemplates,
      (template) => (template.id.includes("deep") ? 2 : 1),
    ).id,
    events: selectedEvents,
    atmosphere: chooseAtmosphere(trimmedTheme),
    tone: chooseTone(trimmedTheme),
    rarityMix: defaultRarityMix,
  };
}
