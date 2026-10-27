import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {parseWeeklyOperation,type WeeklyOperation} from './weekly-config';
import {parseAgendaSettings,type AgendaSettings} from './research-agenda';

export type AutonomousConfig = {
  dataDirectory: string;
  sourcesPath: string;
  pollSeconds: number;
  maxJobsPerCycle: number;
  maxJobsPerDay: number;
  maxDatabaseMiB: number;
  minFreeMiB: number;
  maxKnowledgeFiles: number;
  exploration: number;
  agenda?:AgendaSettings;
  ai: {provider: 'deterministic' | 'ollama'; model: string; timeoutMs: number};
  operation?: WeeklyOperation;
  publication?:{enabled:boolean;repository:'yumirima1/houkago-no-chishikibako';branch:string};
};

export function parseAutonomousConfig(value: unknown, base = process.cwd()): AutonomousConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BACKEND_CONFIG_INVALID');
  const row = value as Record<string, unknown>;
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const v = row[key] ?? fallback;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`BACKEND_CONFIG_INVALID: ${key}`);
    return v;
  };
  const resolve = (key: string, fallback: string) => {
    const v = row[key] ?? fallback;
    if (typeof v !== 'string' || !v.trim()) throw new Error(`BACKEND_CONFIG_INVALID: ${key}`);
    const absolute = path.resolve(base, v);
    if (process.platform === 'win32' && !/^D:\\/i.test(absolute)) throw new Error(`BACKEND_D_DRIVE_REQUIRED: ${key}`);
    return absolute;
  };
  const ai = (row.ai ?? {}) as Record<string, unknown>;
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) throw new Error('BACKEND_CONFIG_INVALID: ai');
  const provider = ai.provider ?? 'deterministic';
  if (provider !== 'deterministic' && provider !== 'ollama') throw new Error('BACKEND_CONFIG_INVALID: provider');
  const timeoutMs = ai.timeoutMs ?? 60000;
  if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000 ||
      (ai.model !== undefined && typeof ai.model !== 'string') || (provider === 'ollama' && !ai.model)) {
    throw new Error('BACKEND_CONFIG_INVALID: ai settings');
  }
  const exploration = row.exploration ?? 0.25;
  const publication=row.publication as AutonomousConfig['publication'];
  if(publication && (typeof publication.enabled!=='boolean'||publication.repository!=='yumirima1/houkago-no-chishikibako'||!/^[-\w/]+$/.test(publication.branch)))throw Error('BACKEND_CONFIG_INVALID: publication');
  if (typeof exploration !== 'number' || exploration < 0 || exploration > 1) throw new Error('BACKEND_CONFIG_INVALID: exploration');
  return {
    dataDirectory: resolve('dataDirectory', process.platform === 'win32' ? 'D:/AI/KousatsuData' : './data/kousatsu'),
    sourcesPath: resolve('sourcesPath', './config/kousatsu-autonomous-sources.json'),
    pollSeconds: integer('pollSeconds',30,5,3600), maxJobsPerCycle: integer('maxJobsPerCycle',6,1,100),
    maxJobsPerDay: integer('maxJobsPerDay',100,1,10000), maxDatabaseMiB: integer('maxDatabaseMiB',1024,1,102400),
    minFreeMiB: integer('minFreeMiB',1024,1,102400), maxKnowledgeFiles: integer('maxKnowledgeFiles',50000,1,1000000),
    exploration, ai:{provider,model: String(ai.model ?? 'rules-v1'),timeoutMs},
    ...(row.agenda===undefined?{}:{agenda:parseAgendaSettings(row.agenda)}),
    ...(row.operation===undefined ? {} : {operation:parseWeeklyOperation(row.operation)}),
    ...(publication?{publication}:{}),
  };
}

export async function loadAutonomousConfig(file = 'config/kousatsu-backend.json') {
  // Relative paths intentionally resolve against the documented project working directory.
  return parseAutonomousConfig(JSON.parse(await readFile(/* turbopackIgnore: true */ file,'utf8')));
}

export function autonomousPaths(config: AutonomousConfig) {
  const root=config.dataDirectory;
  return {root,database:path.join(root,'Memory','kousatsu.sqlite'),notes:path.join(root,'Notes'),
    articles:path.join(root,'Articles'),hypotheses:path.join(root,'Hypotheses'),memory:path.join(root,'Memory'),
    reports:path.join(root,'Reports'),logs:path.join(root,'Logs'),backups:path.join(root,'Backups')};
}
