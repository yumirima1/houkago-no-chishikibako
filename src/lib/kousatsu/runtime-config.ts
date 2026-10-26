import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ResearchSource } from "./runtime-types";

/** Configuration is local, never accepted as filesystem paths from an HTTP request. */
export function runtimePaths() {
  return {
    database: path.resolve(/* turbopackIgnore: true */ process.env.KOUSATSU_DB_PATH || "data/kousatsu/kousatsu.sqlite"),
    output: path.resolve(/* turbopackIgnore: true */ process.env.KOUSATSU_OUTPUT_DIRECTORY || "content/kousatsu/articles"),
    sources: path.resolve(/* turbopackIgnore: true */ process.env.KOUSATSU_SOURCES_PATH || "config/kousatsu-sources.json"),
  };
}

export function parseResearchSources(value: unknown): ResearchSource[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { sources?: unknown }).sources)) {
    throw new Error("SOURCE_CONFIG_INVALID: sources must be an array.");
  }
  const seen = new Set<string>();
  return (value as { sources: unknown[] }).sources.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("SOURCE_CONFIG_INVALID: invalid source.");
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) || seen.has(row.id)) {
      throw new Error("SOURCE_CONFIG_INVALID: unique source id required.");
    }
    seen.add(row.id);
    if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 200 ||
        typeof row.feedUrl !== "string" || typeof row.topic !== "string" || !row.topic.trim() || row.topic.length > 200) {
      throw new Error(`SOURCE_CONFIG_INVALID: name, feedUrl and topic required: ${row.id}`);
    }
    const url = new URL(row.feedUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error(`SOURCE_CONFIG_INVALID: unsafe feed URL: ${row.id}`);
    }
    if (row.contentPolicy !== undefined && row.contentPolicy !== "metadata-only" && row.contentPolicy !== "metadata-and-feed-summary") {
      throw new Error(`SOURCE_CONFIG_INVALID: unknown content policy: ${row.id}`);
    }
    if (row.enabled !== undefined && typeof row.enabled !== "boolean") throw new Error("SOURCE_CONFIG_INVALID: enabled must be boolean.");
    let articlePolicy: ResearchSource['articlePolicy'];
    if (row.articlePolicy !== undefined) {
      const policy=row.articlePolicy as Record<string,unknown>;
      if (!policy || typeof policy!=='object' || typeof policy.enabled!=='boolean' || !Array.isArray(policy.allowedHosts) ||
          policy.allowedHosts.length<1 || policy.allowedHosts.some(host=>typeof host!=='string' || !/^[a-z0-9.-]+$/.test(host) || host.includes('..'))) throw new Error('SOURCE_CONFIG_INVALID: articlePolicy hosts');
      const maxArticles=policy.maxArticles ?? 3,cacheMinutes=policy.cacheMinutes ?? 360,followLinks=policy.followLinks ?? 1;
      if (typeof maxArticles!=='number' || !Number.isInteger(maxArticles) || maxArticles<1 || maxArticles>5 ||
          typeof cacheMinutes!=='number' || cacheMinutes<15 || cacheMinutes>10080 ||
          typeof followLinks!=='number' || !Number.isInteger(followLinks) || followLinks<0 || followLinks>2) throw new Error('SOURCE_CONFIG_INVALID: articlePolicy limits');
      articlePolicy={enabled:policy.enabled,allowedHosts:[...new Set(policy.allowedHosts as string[])],maxArticles,cacheMinutes,followLinks};
    }
    const intervalMinutes = row.intervalMinutes ?? 60;
    const genres=['ai','pc','economy','world','science','culture','environment'];
    if(row.genre!==undefined && !genres.includes(String(row.genre)))throw new Error('SOURCE_CONFIG_INVALID: genre');
    if (typeof intervalMinutes !== "number" || !Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 525_600) {
      throw new Error(`SOURCE_CONFIG_INVALID: intervalMinutes must be 15..525600: ${row.id}`);
    }
    return {
      id: row.id, name: row.name.trim(), feedUrl: url.href, topic: row.topic.trim(),
      enabled: row.enabled === true, intervalMinutes,
      contentPolicy: row.contentPolicy ?? "metadata-only",
      ...(row.genre ? {genre:row.genre} : {}),
      ...(articlePolicy ? {articlePolicy} : {}),
    } as ResearchSource;
  });
}

export async function loadResearchSources(filePath = runtimePaths().sources) {
  // Local configuration belongs to the running installation, not the build output.
  return parseResearchSources(JSON.parse(await readFile(/* turbopackIgnore: true */ filePath, "utf8")));
}
