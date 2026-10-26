import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { ObserverDesktopSnapshot, CollectedNews } from "@/components/observer-room/desktopTypes";
import { autonomousPaths, loadAutonomousConfig, type AutonomousConfig } from "./kousatsu/autonomous-config";
import { loadResearchSources } from "./kousatsu/runtime-config";
import { researchNote, researchSnapshot } from "./kousatsu/runtime-service";

/** Reads the existing daemon's store without starting it or initializing a DB. */
export async function observerDesktopSnapshot(config: AutonomousConfig): Promise<ObserverDesktopSnapshot> {
  const database = autonomousPaths(config).database;
  const snapshot = await researchSnapshot({ databasePath: database, sources: await loadResearchSources(config.sourcesPath) });
  const news: CollectedNews[] = [];
  let supervisorActive = false;
  if (existsSync(/* turbopackIgnore: true */ database)) {
    const reader = new DatabaseSync(database, { readOnly: true });
    try {
      reader.exec("PRAGMA busy_timeout=3000");
      if (snapshot.initialized) {
        const rows = reader.prepare(`SELECT i.id, i.title, i.url, i.published_at, i.fetched_at,
          coalesce(i.summary, '') AS summary, substr(coalesce(i.content, ''), 1, 40000) AS content,
          length(coalesce(i.content, '')) > 40000 AS truncated, s.name AS source
          FROM items i JOIN sources s ON s.id=i.source_id
          ORDER BY coalesce(i.published_at, i.fetched_at) DESC, i.id DESC LIMIT 40`).all();
        for (const row of rows) news.push({
          id: String(row.id), title: String(row.title), source: String(row.source), url: String(row.url),
          publishedAt: row.published_at === null ? null : String(row.published_at),
          fetchedAt: String(row.fetched_at), summary: String(row.summary), content: String(row.content), truncated: Boolean(row.truncated),
        });
      }
      if (reader.prepare("SELECT name FROM sqlite_master WHERE name='autonomy_supervisor'").get()) {
        const row = reader.prepare("SELECT expires_at FROM autonomy_supervisor WHERE id=1").get();
        supervisorActive = Boolean(row && String(row.expires_at) > new Date().toISOString());
      }
    } finally { reader.close(); }
  }
  return { ...snapshot, news, system: {
    readAt: new Date().toISOString(), supervisorActive, pollSeconds: config.pollSeconds,
    maxJobsPerCycle: config.maxJobsPerCycle, provider: config.ai.provider, model: config.ai.model, access: "read-only",
  } };
}

export function createObserverReaders(config = loadAutonomousConfig()) {
  return {
    snapshot: async () => observerDesktopSnapshot(await config),
    note: async (id: string) => researchNote(id, { databasePath: autonomousPaths(await config).database }),
  };
}
