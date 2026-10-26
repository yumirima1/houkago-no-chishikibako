export const weeklyGenres=['ai','pc','economy','world','science','culture','environment'] as const;
export type WeeklyGenre=typeof weeklyGenres[number];
export type WeeklyOperation={id:string;startsAt:string;endsAt:string;dailyAt:string;intervalDays:number;maxArticles:number;genres:WeeklyGenre[]};
const dayMs=86400000,offset=9*3600000;
export function parseWeeklyOperation(value:unknown):WeeklyOperation {
  const v=value as Record<string,unknown>;
  if(!v || typeof v!=='object' || Array.isArray(v) || typeof v.id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id))throw Error('WEEKLY_CONFIG_INVALID: id');
  for(const k of ['startsAt','endsAt'])if(typeof v[k]!=='string' || !/(Z|[+-]\d\d:\d\d)$/.test(v[k] as string) || !Number.isFinite(Date.parse(v[k] as string)))throw Error(`WEEKLY_CONFIG_INVALID: ${k} needs timezone`);
  const start=Date.parse(v.startsAt as string),end=Date.parse(v.endsAt as string);
  if(end<=start || end-start>31*dayMs)throw Error('WEEKLY_CONFIG_INVALID: finite duration <=31 days');
  const dailyAt=v.dailyAt??new Date(start+offset).toISOString().slice(11,16),intervalDays=v.intervalDays??1,maxArticles=v.maxArticles??3;
  if(typeof dailyAt!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyAt) || !Number.isInteger(intervalDays) || Number(intervalDays)<1 || Number(intervalDays)>7 || !Number.isInteger(maxArticles) || Number(maxArticles)<1 || Number(maxArticles)>3)throw Error('WEEKLY_CONFIG_INVALID: schedule/limit');
  if(!Array.isArray(v.genres) || !v.genres.length || v.genres.some(g=>!weeklyGenres.includes(g as WeeklyGenre)) || new Set(v.genres).size!==v.genres.length)throw Error('WEEKLY_CONFIG_INVALID: genres');
  const op={id:v.id,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),dailyAt,intervalDays:Number(intervalDays),maxArticles:Number(maxArticles),genres:v.genres as WeeklyGenre[]};
  if(!weeklySlots(op).length)throw Error('WEEKLY_CONFIG_INVALID: no run inside window');
  return op;
}
export function weeklySlots(op:WeeklyOperation) {
  const slots:Array<{day:string;dueAt:string}>=[];
  const start=Date.parse(op.startsAt),end=Date.parse(op.endsAt),date=new Date(start+offset).toISOString().slice(0,10);
  let due=Date.parse(`${date}T${op.dailyAt}:00+09:00`);
  if(due<start)due+=dayMs;
  for(;due<end;due+=op.intervalDays*dayMs)slots.push({day:new Date(due+offset).toISOString().slice(0,10),dueAt:new Date(due).toISOString()});
  return slots;
}
