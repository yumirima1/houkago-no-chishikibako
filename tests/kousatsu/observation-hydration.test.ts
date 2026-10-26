import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import type { Episode } from "../../src/data/episodes";
import type { ObservationLog, Relationship } from "../../src/components/observation/observationTypes";
import type { useObservationState } from "../../src/components/observation/useObservationState";
import { appendObservationOperation, readObservationStorage } from "../../src/components/observation/observationStorage";

// Regression coverage of the production hook AND ListeningRoom through TypeScript,
// replacing only React's scheduler, browser APIs, audio hooks and child views.
// The controlled scheduler runs functional state updaters synchronously, batches
// rerenders until effects finish, and runs zero-delay hydration timers last.
// This controlled schedule is not proof of real React or browser execution.
type ObservationState = ReturnType<typeof useObservationState>;
type Cleanup = void | (() => void);
type Dependencies = readonly unknown[] | undefined;
type MemoSlot = { dependencies: Dependencies; value: unknown };
type EffectSlot = { cleanup?: Cleanup; dependencies: Dependencies };

const keys = {
  logs: "houkago.observation.logs",
  relationships: "houkago.observation.relationships",
  subject: "houkago.observation.selectedSubject",
  baseline: "houkago.observation.snapshot.v1",
  operations: "houkago.observation.operation.v1.",
};

const savedLog: ObservationLog = {
  actionId: "saved-action", id: "saved-history", source: "observe",
  subjectId: "kana", thought: "An existing observation that must survive reload.",
  timestamp: "2026-01-01T00:00:00.000Z",
};
const savedRelationships: Record<"kana" | "tartar", Relationship> = {
  kana: { dependency: 60, friendship: 80, trust: 90 },
  tartar: { dependency: 50, friendship: 70, trust: 85 },
};

class MemoryStorage {
  readonly values = new Map<string, string>();
  readonly writes: string[] = [];
  failKey: string | undefined;
  failReads = false;

  constructor(existing = true) {
    if (existing) {
      this.values.set(keys.logs, JSON.stringify([savedLog]));
      this.values.set(keys.relationships, JSON.stringify(savedRelationships));
      this.values.set(keys.subject, "kana");
    }
  }

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) {
    if (this.failReads) throw new Error("Simulated storage read failure");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failKey && key.startsWith(this.failKey)) throw new Error(`Simulated storage failure: ${key}`);
    this.writes.push(key);
    this.values.set(key, value);
  }
  json<T>(key: string): T { return JSON.parse(this.values.get(key)!); }
}

function sameDependencies(left: Dependencies, right: Dependencies) {
  return !!left && !!right && left.length === right.length &&
    left.every((value, index) => Object.is(value, right[index]));
}

function createHarness({ existing = true, room = false, search = "", storage: sharedStorage, replayUpdaters = false }: {
  existing?: boolean; room?: boolean; search?: string; storage?: MemoryStorage; replayUpdaters?: boolean;
} = {}) {
  const storage = sharedStorage ?? new MemoryStorage(existing);
  const slots: unknown[] = [];
  const effects: Array<() => void> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let cursor = 0;
  let nextTimer = 0;
  let dirty = false;
  let observation: ObservationState;
  const listeners = new Map<string, Set<(event: { key: string | null }) => void>>();

  const react = {
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((current: T) => T)) => {
        const current = slots[index] as T;
        if (replayUpdaters && typeof next === "function") (next as (current: T) => T)(current);
        const value = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        if (!Object.is(current, value)) { slots[index] = value; dirty = true; }
      };
      return [slots[index], setState];
    },
    useMemo<T>(factory: () => T, dependencies: Dependencies) {
      const index = cursor++;
      const previous = slots[index] as MemoSlot | undefined;
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        slots[index] = { dependencies, value: factory() };
      }
      return (slots[index] as MemoSlot).value;
    },
    useCallback<T>(callback: T, dependencies: Dependencies) {
      return react.useMemo(() => callback, dependencies);
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(callback: () => Cleanup, dependencies: Dependencies) {
      const index = cursor++;
      const previous = slots[index] as EffectSlot | undefined;
      if (previous && sameDependencies(previous.dependencies, dependencies)) return;
      const slot: EffectSlot = { dependencies };
      slots[index] = slot;
      effects.push(() => {
        if (typeof previous?.cleanup === "function") previous.cleanup();
        slot.cleanup = callback();
      });
    },
  };
  const browserWindow = {
    localStorage: storage,
    location: { search },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    setTimeout(callback: () => void, delay: number) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id: number) { timers.delete(id); },
    addEventListener(type: string, callback: (event: { key: string | null }) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener(type: string, callback: (event: { key: string | null }) => void) {
      listeners.get(type)?.delete(callback);
    },
  };
  const context = vm.createContext({
    URLSearchParams, window: browserWindow,
    document: { body: { style: { overflow: "" } } },
  });
  const cache = new Map<string, Record<string, unknown>>();
  const childViews = new Set([
    "@/components/AmbientSoundControls", "@/components/BgmControls", "@/components/Clock",
    "@/components/EpisodeList", "@/components/observation/SubjectRoomView",
  ]);
  function loadFile(relativePath: string): Record<string, unknown> {
    const filename = path.resolve(relativePath);
    if (cache.has(filename)) return cache.get(filename)!;
    const exports: Record<string, unknown> = {};
    cache.set(filename, exports);
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const requireModule = (specifier: string): unknown => {
      if (specifier === "react") return react;
      // Navigation is outside this persistence harness; retain its element shape.
      if (specifier === "next/link") return { default: "a", __esModule: true };
      if (specifier === "react/jsx-runtime") {
        const jsx = (type: unknown, props: unknown) => ({ type, props });
        return { Fragment: "fragment", jsx, jsxs: jsx };
      }
      if (childViews.has(specifier)) return {};
      if (specifier === "@/hooks/useAmbientAudio") return { useAmbientAudio: () => ({}) };
      if (specifier === "@/hooks/useBroadcastAmbience") return { useBroadcastAmbience: () => ({}) };
      if (specifier === "@/components/kousatsu/ResearchConsole") return { ResearchConsole: () => null };
      if (specifier === "@/components/kousatsu/useResearchRuntime") {
        return { useResearchRuntime: () => ({ snapshot: null, error: null, busy: false }) };
      }
      if (specifier === "@/lib/kousatsu/runtime-status") return loadFile("src/lib/kousatsu/runtime-status.ts");
      if (specifier === "@/components/observation/useObservationState") {
        return { useObservationState: () => {
          observation = actualHook();
          return observation;
        } };
      }
      if (specifier === "@/components/observation/subjectEngine") {
        return loadFile("src/components/observation/subjectEngine.ts");
      }
      if (specifier === "@/components/observation/observationStorage") {
        return loadFile("src/components/observation/observationStorage.ts");
      }
      if (specifier === "@/data/episodes") return loadFile("src/data/episodes.ts");
      if (specifier === "./generatedEpisodes") return { generatedEpisodes: [] };
      throw new Error(`Unexpected test module dependency: ${specifier}`);
    };
    const execute = new vm.Script(`(function(require, exports) {\n${output}\n})`, { filename }).runInContext(context);
    execute(requireModule, exports);
    return exports;
  }
  const actualHook = loadFile("src/components/observation/useObservationState.ts").useObservationState as () => ObservationState;
  const ListeningRoom = room
    ? loadFile("src/components/ListeningRoom.tsx").ListeningRoom as (props: { episodes: Episode[] }) => unknown
    : undefined;
  const episode: Episode = {
    id: "episode-005", title: "Diagnostic fixture", description: "No real assets",
    duration: "01:00", publishedAt: "2026-01-01", productionStatus: "published",
    speakers: { science: "A", humanities: "B" }, themes: [],
  };
  const render = () => {
    cursor = 0;
    dirty = false;
    if (ListeningRoom) ListeningRoom({ episodes: [episode] });
    else observation = actualHook();
  };
  const settle = () => {
    for (let index = 0; index < 20; index++) {
      while (effects.length) effects.shift()!();
      if (!dirty) return;
      render();
    }
    throw new Error("Diagnostic scheduler did not settle.");
  };
  return {
    storage,
    get state() { return observation; },
    mount() { render(); settle(); },
    update() { render(); settle(); },
    storageEvent(key: string | null = null) {
      for (const callback of listeners.get("storage") ?? []) callback({ key });
      if (dirty) render();
      settle();
    },
    hydrate() {
      for (const [id, timer] of [...timers]) {
        if (timer.delay !== 0) continue;
        timers.delete(id);
        timer.callback();
        if (dirty) render();
        settle();
      }
    },
  };
}

test("hydration preserves legacy observations, selection and relationships without writes", () => {
  const harness = createHarness();
  harness.mount();
  assert.equal(harness.state.hydrated, false);
  assert.equal(harness.state.logs.length, 0);
  assert.equal(harness.storage.writes.length, 0);
  harness.hydrate();
  assert.equal(harness.state.hydrated, true);
  assert.equal(harness.state.storageError, null);
  assert.equal(harness.state.selectedSubjectId, "kana");
  assert.equal(harness.state.logs[0].id, savedLog.id);
  assert.equal(harness.state.relationships.kana.trust, 90);
  assert.equal(harness.storage.writes.length, 0);
});

test("ListeningRoom waits for hydration and retains the saved subject and complete history", () => {
  const harness = createHarness({ room: true });
  const original = [...harness.storage.values];
  harness.mount();
  assert.deepEqual([...harness.storage.values], original);
  harness.hydrate();
  assert.equal(harness.state.selectedSubjectId, "kana");
  assert.equal(harness.state.logs[0].id, savedLog.id);
  assert.equal(harness.state.relationships.kana.trust, 90);
  assert.deepEqual([...harness.storage.values], original);
});

test("first startup records one visit and reload preserves all subsequent observations", () => {
  const first = createHarness({ room: true, existing: false });
  first.mount();
  assert.equal(first.storage.writes.length, 0);
  first.hydrate();
  assert.equal(first.state.logs.length, 1);
  first.state.recordObservation("tartar", "observe");
  first.update();
  const before = first.state.logs;
  assert.equal(before.length, 2);
  const reload = createHarness({ room: true, storage: first.storage });
  reload.mount();
  reload.hydrate();
  assert.equal(reload.state.logs.length, 2);
  assert.deepEqual(Array.from(reload.state.logs, (log) => log.id), Array.from(before, (log) => log.id));
});

test("early operations cannot write; ordered operations after hydration preserve saved history", () => {
  const harness = createHarness();
  harness.mount();
  assert.equal(harness.state.recordObservation("kana", "observe"), null);
  assert.equal(harness.state.selectSubject("tartar"), null);
  assert.equal(harness.storage.writes.length, 0);
  harness.hydrate();
  harness.state.recordObservation("kana", "observe");
  harness.state.recordObservation("kana", "dialogue");
  harness.update();
  assert.equal(harness.state.logs.length, 3);
  assert.equal(harness.state.logs[0].source, "dialogue");
  assert.equal(harness.state.logs[1].source, "observe");
  assert.equal(harness.state.logs[2].id, savedLog.id);
  assert.equal(harness.state.relationships.kana.trust, 94);
  assert.equal(harness.storage.getItem(keys.logs), JSON.stringify([savedLog]));
  assert.equal(harness.storage.getItem(keys.relationships), JSON.stringify(savedRelationships));
});

test("a baseline write failure does not change selection or create a partial observation", () => {
  const harness = createHarness();
  harness.mount();
  harness.hydrate();
  const original = [...harness.storage.values];
  harness.storage.failKey = keys.baseline;
  assert.equal(harness.state.selectSubject("tartar"), null);
  harness.update();
  assert.match(harness.state.storageError!, /Simulated storage failure/);
  assert.equal(harness.state.selectedSubjectId, "kana");
  assert.equal(harness.state.logs.length, 1);
  assert.deepEqual([...harness.storage.values], original);
  harness.storage.failKey = undefined;
  assert.ok(harness.state.selectSubject("tartar"));
  harness.update();
  assert.equal(harness.state.storageError, null);
  assert.equal(harness.state.selectedSubjectId, "tartar");
  assert.equal(harness.state.logs.length, 2);
});

test("an operation write failure preserves the baseline; retry and reload commit one complete observation", () => {
  const harness = createHarness();
  harness.mount();
  harness.hydrate();
  harness.storage.failKey = keys.operations;
  assert.equal(harness.state.recordObservation("kana", "dialogue"), null);
  harness.update();
  assert.equal(harness.state.logs.length, 1);
  assert.equal(harness.state.relationships.kana.trust, 90);
  const baseline = harness.storage.json<{ logs: ObservationLog[] }>(keys.baseline);
  assert.equal(baseline.logs[0].id, savedLog.id);
  assert.equal([...harness.storage.values.keys()].some((key) => key.startsWith(keys.operations)), false);
  harness.storage.failKey = undefined;
  assert.ok(harness.state.recordObservation("kana", "dialogue"));
  harness.update();
  assert.equal(harness.state.logs.length, 2);
  assert.equal(harness.state.relationships.kana.trust, 93);
  const reload = createHarness({ storage: harness.storage });
  reload.mount(); reload.hydrate();
  assert.equal(reload.state.logs.length, 2);
  assert.equal(reload.state.relationships.kana.trust, 93);
  assert.equal(reload.state.logs[1].id, savedLog.id);
});

test("malformed legacy JSON or schema never becomes an empty writable profile", () => {
  const invalidEntries = [
    [keys.logs, "{broken"],
    [keys.logs, '{"not":"a log list"}'],
    [keys.relationships, '{"kana":{"trust":999}}'],
    [keys.subject, "unknown-subject"],
    [keys.baseline, '{"schemaVersion":99}'],
    [keys.operations + "broken", '{"schemaVersion":1}'],
  ];
  for (const [key, value] of invalidEntries) {
    const harness = createHarness({ room: true });
    harness.storage.values.set(key, value);
    const original = [...harness.storage.values];
    harness.mount(); harness.hydrate();
    assert.equal(harness.state.hydrated, false, key);
    assert.match(harness.state.storageError!, /OBSERVATION_STORAGE_INVALID/);
    assert.equal(harness.state.recordObservation("kana"), null);
    assert.equal(harness.state.selectSubject("tartar"), null);
    assert.deepEqual([...harness.storage.values], original);
    assert.equal(harness.storage.writes.length, 0);
  }
});

test("storage read failure preserves bytes and can be explicitly retried", () => {
  const harness = createHarness({ room: true });
  const original = [...harness.storage.values];
  harness.storage.failReads = true;
  harness.mount(); harness.hydrate();
  assert.equal(harness.state.hydrated, false);
  assert.match(harness.state.storageError!, /read failure/);
  assert.equal(harness.state.selectSubject("tartar"), null);
  assert.deepEqual([...harness.storage.values], original);
  harness.storage.failReads = false;
  harness.state.reloadStoredState(); harness.update();
  assert.equal(harness.state.hydrated, true);
  assert.equal(harness.state.storageError, null);
  assert.equal(harness.state.selectedSubjectId, "kana");
  assert.equal(harness.state.logs[0].id, savedLog.id);
});

test("replayed functional updaters and duplicate automatic selection cannot duplicate persistence", () => {
  const harness = createHarness({ room: true, existing: false, replayUpdaters: true });
  harness.mount(); harness.hydrate();
  assert.equal(harness.state.logs.length, 1);
  assert.equal(harness.storage.writes.filter((key) => key.startsWith(keys.operations)).length, 1);
  harness.state.selectSubject("tartar");
  harness.state.selectSubject("tartar");
  harness.update();
  assert.equal(harness.state.logs.length, 1);
  harness.state.recordObservation("tartar", "dialogue");
  harness.update();
  assert.equal(harness.state.logs.length, 2);
  assert.equal(harness.storage.writes.filter((key) => key.startsWith(keys.operations)).length, 2);
});

test("stale tabs merge append-only observations and react to storage notifications", () => {
  const storage = new MemoryStorage();
  const first = createHarness({ storage });
  const second = createHarness({ storage });
  first.mount(); second.mount(); first.hydrate(); second.hydrate();
  const firstLog = first.state.recordObservation("kana", "observe")!;
  first.update();
  const secondLog = second.state.recordObservation("kana", "dialogue")!;
  second.update();
  assert.equal(second.state.logs.length, 3);
  assert.equal(second.state.relationships.kana.trust, 94);
  first.storageEvent(keys.operations + secondLog.id);
  assert.equal(first.state.logs.length, 3);
  assert.equal(first.state.relationships.kana.trust, 94);
  assert.ok(first.state.logs.some((log) => log.id === firstLog.id));
  assert.ok(first.state.logs.some((log) => log.id === secondLog.id));
  assert.ok(first.state.logs.some((log) => log.id === savedLog.id));
});

test("journal replay retains more than forty observations and their original identifiers", () => {
  const harness = createHarness();
  harness.mount(); harness.hydrate();
  for (let index = 0; index < 45; index++) harness.state.recordObservation("kana", "observe");
  harness.update();
  assert.equal(harness.state.logs.length, 46);
  const identifiers = Array.from(harness.state.logs, (log) => log.id);
  const reload = createHarness({ storage: harness.storage });
  reload.mount(); reload.hydrate();
  assert.deepEqual(Array.from(reload.state.logs, (log) => log.id), identifiers);
  assert.equal(reload.state.logs[45].id, savedLog.id);
});

test("requested subject affects the current visit without overwriting legacy storage during load", () => {
  const harness = createHarness({ room: true, search: "?subject=tartar" });
  harness.mount(); harness.hydrate();
  assert.equal(harness.state.selectedSubjectId, "tartar");
  assert.equal(harness.storage.writes.length, 0);
  harness.state.recordObservation("tartar", "dialogue");
  harness.update();
  assert.equal(harness.state.selectedSubjectId, "tartar");
  const reload = createHarness({ storage: harness.storage });
  reload.mount(); reload.hydrate();
  assert.equal(reload.state.selectedSubjectId, "tartar");
  assert.equal(reload.state.logs[1].id, savedLog.id);
  assert.equal(harness.storage.getItem(keys.subject), "kana");
});

test("an interrupted baseline write is recoverable without committing an observation", () => {
  const storage = new MemoryStorage();
  storage.failKey = keys.operations;
  const nextLog = { ...savedLog, id: "next-log" };
  assert.throws(() => appendObservationOperation(storage, nextLog, "tartar"), /Simulated storage failure/);
  const recovered = readObservationStorage(storage);
  assert.equal(recovered.logs.length, 1);
  assert.equal(recovered.logs[0].id, savedLog.id);
  assert.equal(recovered.relationships.kana.trust, 90);
  assert.equal(recovered.selectedSubjectId, "kana");
  storage.failKey = undefined;
  const committed = appendObservationOperation(storage, nextLog, "tartar");
  assert.equal(committed.logs.length, 2);
  assert.equal(committed.selectedSubjectId, "tartar");
  const before = storage.writes.length;
  assert.equal(appendObservationOperation(storage, nextLog, "tartar").logs.length, 2);
  assert.equal(storage.writes.length, before);
});

test("concurrent journal appends cannot overwrite each other's operations", () => {
  const storage = new MemoryStorage();
  const originalSet = storage.setItem.bind(storage);
  const first = { ...savedLog, id: "first-concurrent", source: "dialogue" as const };
  const second = { ...savedLog, id: "second-concurrent", source: "observe" as const };
  let interleaved = false;
  storage.setItem = (key, value) => {
    if (!interleaved && key === keys.operations + first.id) {
      interleaved = true;
      appendObservationOperation(storage, second);
    }
    originalSet(key, value);
  };
  const committed = appendObservationOperation(storage, first);
  assert.equal(committed.logs.length, 3);
  assert.equal(committed.relationships.kana.trust, 94);
  assert.equal(committed.relationships.kana.friendship, 82);
  assert.ok(storage.values.has(keys.operations + first.id));
  assert.ok(storage.values.has(keys.operations + second.id));
  assert.equal(readObservationStorage(storage).logs.length, 3);
});

test("sequential order survives equal or backwards wall-clock timestamps", () => {
  const storage = new MemoryStorage();
  const first = { ...savedLog, id: "z-first", timestamp: "2026-03-01T00:00:00.000Z" };
  const second = { ...savedLog, id: "a-second", timestamp: "2026-02-01T00:00:00.000Z" };
  appendObservationOperation(storage, first);
  const result = appendObservationOperation(storage, second);
  assert.deepEqual(result.logs.map((log) => log.id), [second.id, first.id, savedLog.id]);
  assert.equal(result.logs[0].timestamp, second.timestamp);
});

test("conflicting operation identity is rejected and existing journal bytes remain intact", () => {
  const storage = new MemoryStorage();
  const log = { ...savedLog, id: "fixed-operation-id" };
  appendObservationOperation(storage, log);
  const original = [...storage.values];
  assert.throws(() => appendObservationOperation(storage, { ...log, thought: "different observation" }), /CONFLICT/);
  assert.deepEqual([...storage.values], original);
  assert.equal(readObservationStorage(storage).logs.length, 2);
});

test("post-commit read failure acknowledges the saved operation and blocks duplicate retry until reload", () => {
  const harness = createHarness();
  harness.mount(); harness.hydrate();
  const originalSet = harness.storage.setItem.bind(harness.storage);
  harness.storage.setItem = (key, value) => {
    originalSet(key, value);
    if (key.startsWith(keys.operations)) harness.storage.failReads = true;
  };
  const saved = harness.state.recordObservation("kana", "dialogue");
  harness.update();
  assert.ok(saved);
  assert.equal(harness.state.logs.length, 2);
  assert.equal(harness.state.hydrated, false);
  assert.match(harness.state.storageError!, /READ_AFTER_COMMIT_FAILED/);
  assert.equal(harness.state.recordObservation("kana", "dialogue"), null);
  assert.equal(harness.storage.writes.filter((key) => key.startsWith(keys.operations)).length, 1);
  harness.storage.failReads = false;
  harness.state.reloadStoredState(); harness.update();
  assert.equal(harness.state.hydrated, true);
  assert.equal(harness.state.storageError, null);
  assert.equal(harness.state.logs.length, 2);
  assert.equal(harness.state.logs[0].id, saved.id);
  assert.equal(harness.state.relationships.kana.trust, 93);
});
