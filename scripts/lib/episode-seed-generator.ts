import { readdir, readFile, stat } from "node:fs/promises";
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
  eventSelection?: {
    cooldownNotes: string[];
    correlationNotes: string[];
    historyWindow: number;
    recentEventIds: string[];
  };
};

export type EpisodeSeedHistoryEntry = {
  episodeId?: string;
  eventIds: string[];
  temperature?: EpisodeSeedTemperature;
};

type EpisodeSeedHistoryEntryWithSort = EpisodeSeedHistoryEntry & {
  episodeNumber?: number;
  mtimeMs?: number;
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
  history?: EpisodeSeedHistoryEntry[];
  historyWindow?: number;
  theme: string;
  useHistory?: boolean;
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
const REVIEWED_DIR = path.join(process.cwd(), "content", "reviewed");
const DRAFT_DIR = path.join(process.cwd(), "content", "drafts");
const EPISODE_SEED_HISTORY_PATH = path.join(
  process.cwd(),
  "content",
  "memory",
  "episode-seed-history.json",
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

function defaultCooldownForRarity(rarity: EpisodeSeedRarity) {
  if (rarity === "Legendary") {
    return 12;
  }

  if (rarity === "Epic") {
    return 8;
  }

  if (rarity === "Rare") {
    return 4;
  }

  return 2;
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

async function readJsonIfExists(filePath: string) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function listJsonFilesIfExists(dirPath: string) {
  try {
    const files = await readdir(dirPath);

    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(dirPath, file));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function getEpisodeNumber(episodeId: string | undefined) {
  const match = episodeId?.match(/episode-(\d+)/);

  return match ? Number(match[1]) : undefined;
}

function parseHistoryEntry(value: unknown): EpisodeSeedHistoryEntry | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as {
    id?: unknown;
    source?: {
      draftScriptEngine?: {
        eventPlan?: {
          selectedEventIds?: unknown;
        };
        temperature?: unknown;
      };
    };
  };
  const selectedEventIds =
    source.source?.draftScriptEngine?.eventPlan?.selectedEventIds;

  if (!Array.isArray(selectedEventIds)) {
    return undefined;
  }

  const eventIds = selectedEventIds.filter(
    (eventId): eventId is string => typeof eventId === "string",
  );

  if (eventIds.length === 0) {
    return undefined;
  }

  return {
    episodeId: typeof source.id === "string" ? source.id : undefined,
    eventIds,
    temperature: isEpisodeSeedTemperature(
      source.source?.draftScriptEngine?.temperature,
    )
      ? source.source?.draftScriptEngine?.temperature
      : undefined,
  };
}

function parseHistoryFile(value: unknown): EpisodeSeedHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map<EpisodeSeedHistoryEntry | undefined>((item) => {
      if (!item || typeof item !== "object") {
        return undefined;
      }

      const entry = item as Record<string, unknown>;
      const eventIds = Array.isArray(entry.eventIds)
        ? entry.eventIds.filter(
            (eventId): eventId is string => typeof eventId === "string",
          )
        : [];

      if (eventIds.length === 0) {
        return undefined;
      }

      return {
        episodeId:
          typeof entry.episodeId === "string" ? entry.episodeId : undefined,
        eventIds,
        temperature: isEpisodeSeedTemperature(entry.temperature)
          ? entry.temperature
          : undefined,
      };
    })
    .filter((entry): entry is EpisodeSeedHistoryEntry => Boolean(entry));
}

function isEpisodeSeedTemperature(
  value: unknown,
): value is EpisodeSeedTemperature {
  return (
    value === "warm" ||
    value === "normal" ||
    value === "deep" ||
    value === "funny" ||
    value === "quiet"
  );
}

export async function readEpisodeSeedHistory() {
  const [historyFileValue, reviewedFiles, draftFiles] = await Promise.all([
    readJsonIfExists(EPISODE_SEED_HISTORY_PATH),
    listJsonFilesIfExists(REVIEWED_DIR),
    listJsonFilesIfExists(DRAFT_DIR),
  ]);
  const fileHistory = historyFileValue ? parseHistoryFile(historyFileValue) : [];
  const scriptFiles = [...reviewedFiles, ...draftFiles];
  const scriptHistory = (
    await Promise.all(
    scriptFiles.map(
      async (filePath): Promise<EpisodeSeedHistoryEntryWithSort | undefined> => {
      const [value, fileStat] = await Promise.all([
        readJsonIfExists(filePath),
        stat(filePath),
      ]);
      const entry = parseHistoryEntry(value);

      if (!entry) {
        return undefined;
      }

        const episodeNumber = getEpisodeNumber(entry.episodeId);

        return {
          ...entry,
          ...(typeof episodeNumber === "number" ? { episodeNumber } : {}),
          mtimeMs: fileStat.mtimeMs,
        };
      },
    ),
  )
  ).filter(
    (entry): entry is EpisodeSeedHistoryEntryWithSort => Boolean(entry),
  );
  const combinedHistory: EpisodeSeedHistoryEntryWithSort[] = [
    ...fileHistory.map((entry) => {
      const episodeNumber = getEpisodeNumber(entry.episodeId);

      return {
        ...entry,
        ...(typeof episodeNumber === "number" ? { episodeNumber } : {}),
        mtimeMs: 0,
      };
    }),
    ...scriptHistory,
  ];

  return combinedHistory
    .sort((left, right) => {
      const leftNumber = left.episodeNumber;
      const rightNumber = right.episodeNumber;

      if (typeof leftNumber === "number" && typeof rightNumber === "number") {
        return rightNumber - leftNumber;
      }

      const leftMtime = left.mtimeMs ?? 0;
      const rightMtime = right.mtimeMs ?? 0;

      return rightMtime - leftMtime;
    })
    .map((entry) => ({
      ...(entry.episodeId ? { episodeId: entry.episodeId } : {}),
      eventIds: entry.eventIds,
      ...(entry.temperature ? { temperature: entry.temperature } : {}),
    }));
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

function eventKindFromEvent(event: SeedEvent) {
  const normalized = (event.type ?? event.category ?? "event")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (normalized === "内輪ネタ" || normalized === "inside_joke") {
    return "inside_joke";
  }

  if (normalized === "脱線" || normalized === "detour") {
    return "detour";
  }

  return normalized;
}

function recentEventIds(history: EpisodeSeedHistoryEntry[], historyWindow: number) {
  return history.slice(0, historyWindow).flatMap((entry) => entry.eventIds);
}

function recentEventDistance(
  history: EpisodeSeedHistoryEntry[],
  eventId: string,
) {
  const index = history.findIndex((entry) => entry.eventIds.includes(eventId));

  return index >= 0 ? index + 1 : undefined;
}

function eventUseCount(history: EpisodeSeedHistoryEntry[], eventId: string) {
  return history.filter((entry) => entry.eventIds.includes(eventId)).length;
}

function recentKindDistance(
  history: EpisodeSeedHistoryEntry[],
  eventById: Map<string, SeedEvent>,
  kind: string,
) {
  const index = history.findIndex((entry) =>
    entry.eventIds.some((eventId) => {
      const event = eventById.get(eventId);

      return event ? eventKindFromEvent(event) === kind : false;
    }),
  );

  return index >= 0 ? index + 1 : undefined;
}

function correlationMultiplier(event: SeedEvent, selectedEvents: SeedEvent[]) {
  let multiplier = 1;

  for (const selectedEvent of selectedEvents) {
    const pairsWell =
      event.correlation?.pairsWellWith?.includes(selectedEvent.id) ||
      selectedEvent.correlation?.pairsWellWith?.includes(event.id);
    const avoids =
      event.correlation?.avoidWith?.includes(selectedEvent.id) ||
      selectedEvent.correlation?.avoidWith?.includes(event.id);

    if (pairsWell) {
      multiplier *= 1.7;
    }

    if (avoids) {
      multiplier *= 0.05;
    }
  }

  return multiplier;
}

function cooldownMultiplier({
  event,
  eventById,
  history,
}: {
  event: SeedEvent;
  eventById: Map<string, SeedEvent>;
  history: EpisodeSeedHistoryEntry[];
}) {
  let multiplier = 1;
  const rarity = normalizeRarity(event.rarity);
  const cooldownEpisodes =
    event.cooldownEpisodes ?? defaultCooldownForRarity(rarity);
  const eventDistance = recentEventDistance(history, event.id);
  const useCount = eventUseCount(history, event.id);

  if (useCount > 0) {
    multiplier *= 1 / (1 + useCount * 0.45);
  }

  if (eventDistance && eventDistance <= cooldownEpisodes) {
    multiplier *= Math.max(0.02, (eventDistance / (cooldownEpisodes + 1)) ** 2);
  }

  const kind = eventKindFromEvent(event);

  if (kind === "inside_joke") {
    const kindDistance = recentKindDistance(history, eventById, "inside_joke");

    if (kindDistance && kindDistance <= 6) {
      multiplier *= Math.max(0.05, kindDistance / 7);
    }
  }

  if (kind === "detour") {
    const kindDistance = recentKindDistance(history, eventById, "detour");

    if (kindDistance && kindDistance <= 3) {
      multiplier *= Math.max(0.15, kindDistance / 4);
    }
  }

  return multiplier;
}

function effectiveEventWeight({
  event,
  eventById,
  history,
  selectedEvents,
}: {
  event: SeedEvent;
  eventById: Map<string, SeedEvent>;
  history: EpisodeSeedHistoryEntry[];
  selectedEvents: SeedEvent[];
}) {
  return (
    event.weight *
    cooldownMultiplier({ event, eventById, history }) *
    correlationMultiplier(event, selectedEvents)
  );
}

function describeCooldownNotes({
  events,
  history,
  selectedEvents,
}: {
  events: SeedEvent[];
  history: EpisodeSeedHistoryEntry[];
  selectedEvents: SeedEvent[];
}) {
  const notes: string[] = [];
  const selectedEventIds = new Set(selectedEvents.map((event) => event.id));
  const selectedKinds = new Set(selectedEvents.map(eventKindFromEvent));
  const eventById = new Map(events.map((event) => [event.id, event]));

  for (const event of events) {
    const rarity = normalizeRarity(event.rarity);
    const cooldownEpisodes =
      event.cooldownEpisodes ?? defaultCooldownForRarity(rarity);
    const eventDistance = recentEventDistance(history, event.id);

    if (
      eventDistance &&
      eventDistance <= cooldownEpisodes &&
      !selectedEventIds.has(event.id)
    ) {
      notes.push(
        `${event.id} cooled down (${eventDistance}/${cooldownEpisodes}).`,
      );
    }
  }

  if (
    selectedKinds.has("inside_joke") &&
    recentKindDistance(history, eventById, "inside_joke")
  ) {
    notes.push("inside_joke selected with reduced weight because recent history was checked.");
  }

  if (notes.length === 0) {
    notes.push("No recent event history applied, or no cooldown conflict found.");
  }

  return notes.slice(0, 8);
}

function describeCorrelationNotes(selectedEvents: SeedEvent[]) {
  const notes: string[] = [];

  for (const event of selectedEvents) {
    for (const selectedEvent of selectedEvents) {
      if (event.id === selectedEvent.id) {
        continue;
      }

      if (event.correlation?.pairsWellWith?.includes(selectedEvent.id)) {
        notes.push(`${event.id} pairs well with ${selectedEvent.id}.`);
      }

      if (event.correlation?.avoidWith?.includes(selectedEvent.id)) {
        notes.push(`${event.id} avoids ${selectedEvent.id}; selected only as low-probability fallback.`);
      }
    }
  }

  return [...new Set(notes)];
}

function pickEventByRarity(
  events: SeedEvent[],
  rarity: EpisodeSeedRarity,
  excludedIds: Set<string>,
  selectedEvents: SeedEvent[],
  history: EpisodeSeedHistoryEntry[],
  eventById: Map<string, SeedEvent>,
) {
  const candidates = events.filter(
    (event) => normalizeRarity(event.rarity) === rarity && !excludedIds.has(event.id),
  );

  if (candidates.length > 0) {
    return pickWeighted(candidates, (event) =>
      effectiveEventWeight({ event, eventById, history, selectedEvents }),
    );
  }

  const fallbackCandidates = events.filter((event) => !excludedIds.has(event.id));

  return pickWeighted(fallbackCandidates, (event) =>
    effectiveEventWeight({ event, eventById, history, selectedEvents }),
  );
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
  history,
  historyWindow = 12,
  theme,
  useHistory = true,
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
  const selectedEvents: SeedEvent[] = [];
  const safeEventCount = Math.max(1, Math.min(eventCount, events.length));
  const eventById = new Map(events.map((event) => [event.id, event]));
  const seedHistory = useHistory
    ? (history ?? (await readEpisodeSeedHistory())).slice(0, historyWindow)
    : [];

  for (let index = 0; index < safeEventCount; index += 1) {
    const event = pickEventByRarity(
      events,
      pickRarity(),
      selectedEventIds,
      selectedEvents,
      seedHistory,
      eventById,
    );

    selectedEventIds.add(event.id);
    selectedEvents.push(event);
  }

  return {
    theme: trimmedTheme,
    structureTemplate: pickWeighted(
      structureTemplates,
      (template) => (template.id.includes("deep") ? 2 : 1),
    ).id,
    events: selectedEvents.map((event) => event.id),
    atmosphere: chooseAtmosphere(trimmedTheme),
    eventSelection: {
      cooldownNotes: describeCooldownNotes({
        events,
        history: seedHistory,
        selectedEvents,
      }),
      correlationNotes: describeCorrelationNotes(selectedEvents),
      historyWindow,
      recentEventIds: recentEventIds(seedHistory, historyWindow).slice(0, 20),
    },
    tone: chooseTone(trimmedTheme),
    rarityMix: defaultRarityMix,
  };
}
