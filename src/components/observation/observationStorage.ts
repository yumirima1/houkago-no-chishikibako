import type { ObservationLog, Relationship, SubjectId } from "@/components/observation/observationTypes";
import { defaultRelationship, updateRelationship } from "@/components/observation/subjectEngine";

export const observationStorageKeys = {
  baseline: "houkago.observation.snapshot.v1",
  logs: "houkago.observation.logs",
  operationPrefix: "houkago.observation.operation.v1.",
  relationships: "houkago.observation.relationships",
  subject: "houkago.observation.selectedSubject",
};

export type ObservationSnapshot = {
  lastSequence: number;
  storageWarning?: string;
  logs: ObservationLog[];
  relationships: Record<SubjectId, Relationship>;
  selectedSubjectId: SubjectId | null;
};
type StoredSnapshot = ObservationSnapshot & { schemaVersion: 1 };
type StoredOperation = { schemaVersion: 1; sequence: number; log: ObservationLog; selectedSubjectId?: SubjectId };
export type ObservationStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length">;

export function emptyObservationSnapshot(): ObservationSnapshot {
  return {
    lastSequence: 0,
    logs: [],
    relationships: { kana: { ...defaultRelationship }, tartar: { ...defaultRelationship } },
    selectedSubjectId: null,
  };
}

function subjectId(value: unknown): value is SubjectId { return value === "kana" || value === "tartar"; }
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validRelationship(value: unknown): value is Relationship {
  if (!record(value)) return false;
  return ["dependency", "friendship", "trust"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 100,
  ) && (value.lastVisitedAt === undefined ||
    (typeof value.lastVisitedAt === "string" && Number.isFinite(Date.parse(value.lastVisitedAt))));
}
function validRelationships(value: unknown): value is ObservationSnapshot["relationships"] {
  return record(value) && validRelationship(value.kana) && validRelationship(value.tartar);
}
function validLog(value: unknown): value is ObservationLog {
  if (!record(value)) return false;
  return subjectId(value.subjectId) && typeof value.id === "string" && !!value.id &&
    typeof value.actionId === "string" && typeof value.thought === "string" &&
    typeof value.timestamp === "string" && Number.isFinite(Date.parse(value.timestamp)) &&
    typeof value.source === "string" && ["visit", "observe", "room-object", "dialogue"].includes(value.source) &&
    ["broadcastHint", "createdAt", "logText", "mood", "themeCandidate"].every((key) =>
      value[key] === undefined || typeof value[key] === "string",
    ) && (value.objectId === undefined || ["crt", "envelope", "terminal", "memo", "window", "lamp", "radio", "clock"]
      .includes(String(value.objectId)));
}
function validLogs(value: unknown): value is ObservationLog[] {
  return Array.isArray(value) && value.every(validLog) && new Set(value.map((log) => log.id)).size === value.length;
}
function parse(raw: string, label: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new Error(`OBSERVATION_STORAGE_INVALID: ${label}`); }
}

function readBaseline(storage: ObservationStorage): ObservationSnapshot {
  const raw = storage.getItem(observationStorageKeys.baseline);
  if (raw !== null) {
    const value = parse(raw, "baseline");
    if (!record(value) || value.schemaVersion !== 1 || value.lastSequence !== 0 || !validLogs(value.logs) ||
      !validRelationships(value.relationships) ||
      (value.selectedSubjectId !== null && !subjectId(value.selectedSubjectId))) {
      throw new Error("OBSERVATION_STORAGE_INVALID: baseline schema");
    }
    return value as StoredSnapshot;
  }
  const snapshot = emptyObservationSnapshot();
  const logs = storage.getItem(observationStorageKeys.logs);
  const relationships = storage.getItem(observationStorageKeys.relationships);
  const selected = storage.getItem(observationStorageKeys.subject);
  if (logs !== null) {
    const value = parse(logs, "legacy logs");
    if (!validLogs(value)) throw new Error("OBSERVATION_STORAGE_INVALID: legacy logs schema");
    snapshot.logs = value;
  }
  if (relationships !== null) {
    const value = parse(relationships, "legacy relationships");
    if (!validRelationships(value)) throw new Error("OBSERVATION_STORAGE_INVALID: legacy relationships schema");
    snapshot.relationships = value;
  }
  if (selected !== null) {
    if (!subjectId(selected)) throw new Error("OBSERVATION_STORAGE_INVALID: legacy selected subject");
    snapshot.selectedSubjectId = selected;
  }
  return snapshot;
}

function applyOperation(snapshot: ObservationSnapshot, operation: StoredOperation): ObservationSnapshot {
  const current = snapshot.relationships[operation.log.subjectId];
  const next = updateRelationship(current, operation.log.source);
  next.lastVisitedAt = current.lastVisitedAt && Date.parse(current.lastVisitedAt) > Date.parse(operation.log.timestamp)
    ? current.lastVisitedAt : operation.log.timestamp;
  return {
    ...snapshot,
    lastSequence: Math.max(snapshot.lastSequence, operation.sequence),
    logs: [operation.log, ...snapshot.logs],
    relationships: { ...snapshot.relationships, [operation.log.subjectId]: next },
    selectedSubjectId: operation.selectedSubjectId ?? snapshot.selectedSubjectId,
  };
}

/** Read without writes. Malformed data is preserved and blocks further saving. */
export function readObservationStorage(storage: ObservationStorage): ObservationSnapshot {
  let snapshot = readBaseline(storage);
  const operations: StoredOperation[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(observationStorageKeys.operationPrefix)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const operation = parse(raw, "operation");
    if (!record(operation) || operation.schemaVersion !== 1 ||
      typeof operation.sequence !== "number" || !Number.isSafeInteger(operation.sequence) || operation.sequence < 1 ||
      !validLog(operation.log) ||
      key !== observationStorageKeys.operationPrefix + operation.log.id ||
      (operation.selectedSubjectId !== undefined && !subjectId(operation.selectedSubjectId))) {
      throw new Error("OBSERVATION_STORAGE_INVALID: operation schema");
    }
    operations.push(operation as StoredOperation);
  }
  if (operations.length && storage.getItem(observationStorageKeys.baseline) === null) {
    throw new Error("OBSERVATION_STORAGE_INVALID: operation baseline missing");
  }
  operations.sort((left, right) => left.sequence - right.sequence || Date.parse(left.log.timestamp) - Date.parse(right.log.timestamp) ||
    left.log.id.localeCompare(right.log.id));
  const knownIds = new Set(snapshot.logs.map((log) => log.id));
  for (const operation of operations) {
    if (knownIds.has(operation.log.id)) throw new Error("OBSERVATION_STORAGE_INVALID: duplicate observation id");
    knownIds.add(operation.log.id);
    snapshot = applyOperation(snapshot, operation);
  }
  return snapshot;
}

/** One atomic write per operation; legacy keys and committed journal entries remain intact. */
export function appendObservationOperation(
  storage: ObservationStorage,
  log: ObservationLog,
  selectedSubjectId?: SubjectId,
): ObservationSnapshot {
  const snapshot = readObservationStorage(storage);
  if (!validLog(log) || (selectedSubjectId !== undefined && !subjectId(selectedSubjectId))) {
    throw new Error("OBSERVATION_STORAGE_INVALID: new operation");
  }
  if (storage.getItem(observationStorageKeys.baseline) === null) {
    const baseline: StoredSnapshot = { ...snapshot, schemaVersion: 1 };
    storage.setItem(observationStorageKeys.baseline, JSON.stringify(baseline));
  }
  const key = observationStorageKeys.operationPrefix + log.id;
  const existing = storage.getItem(key);
  if (existing !== null) {
    const saved = parse(existing, "existing operation") as StoredOperation;
    if (JSON.stringify(saved.log) !== JSON.stringify(log) || saved.selectedSubjectId !== selectedSubjectId) {
      throw new Error("OBSERVATION_STORAGE_CONFLICT: observation id already exists");
    }
    return snapshot;
  }
  if (snapshot.lastSequence >= Number.MAX_SAFE_INTEGER) throw new Error("OBSERVATION_STORAGE_INVALID: sequence exhausted");
  const operation: StoredOperation = { schemaVersion: 1, sequence: snapshot.lastSequence + 1, log, selectedSubjectId };
  const committedSnapshot = applyOperation(snapshot, operation);
  storage.setItem(key, JSON.stringify(operation));
  try {
    return readObservationStorage(storage);
  } catch {
    // The atomic write already succeeded. Acknowledge this observation while
    // stopping subsequent writes until a reload can verify the full journal.
    return { ...committedSnapshot, storageWarning: "OBSERVATION_STORAGE_READ_AFTER_COMMIT_FAILED" };
  }
}
