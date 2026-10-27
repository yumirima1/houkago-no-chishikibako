export const weeklyGenres=['ai','pc','economy','world','science','culture','environment'] as const;
export type WeeklyGenre=typeof weeklyGenres[number];
export type WeeklyOperation={id:string;startsAt:string;endsAt:string|null;dailyAt:string;runTimes?:string[];intervalDays:number;maxArticles:number;genres:WeeklyGenre[];continuous?:boolean};
const dayMs=86400000,offset=9*3600000;
export const operationEnd=(op:WeeklyOperation)=>op.endsAt===null?Infinity:Date.parse(op.endsAt);
export const jstDay=(now:number)=>new Date(now+offset).toISOString().slice(0,10);
export const jstDayStart=(now:number)=>new Date(`${jstDay(now)}T00:00:00+09:00`).toISOString();
export function parseWeeklyOperation(value:unknown):WeeklyOperation {
  const v=value as Record<string,unknown>;
  if(!v || typeof v!=='object' || Array.isArray(v) || typeof v.id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id))throw Error('WEEKLY_CONFIG_INVALID: id');
  if(v.continuous!==undefined&&typeof v.continuous!=='boolean')throw Error('WEEKLY_CONFIG_INVALID: continuous');
  const continuous=v.continuous===true;
  for(const k of continuous?['startsAt']:['startsAt','endsAt'])if(typeof v[k]!=='string' || !/(Z|[+-]\d\d:\d\d)$/.test(v[k] as string) || !Number.isFinite(Date.parse(v[k] as string)))throw Error(`WEEKLY_CONFIG_INVALID: ${k} needs timezone`);
  if(continuous&&v.endsAt!=null)throw Error('WEEKLY_CONFIG_INVALID: continuous operations have no endsAt');
  const start=Date.parse(v.startsAt as string),end=continuous?Infinity:Date.parse(v.endsAt as string);
  if(end<=start || (!continuous&&end-start>31*dayMs))throw Error('WEEKLY_CONFIG_INVALID: finite duration <=31 days');
  const dailyAt=v.dailyAt??new Date(start+offset).toISOString().slice(11,16),intervalDays=v.intervalDays??1,maxArticles=v.maxArticles??3;
  if(typeof dailyAt!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyAt) || !Number.isInteger(intervalDays) || Number(intervalDays)<1 || Number(intervalDays)>7 || !Number.isInteger(maxArticles) || Number(maxArticles)<1 || Number(maxArticles)>3)throw Error('WEEKLY_CONFIG_INVALID: schedule/limit');
  if(!Array.isArray(v.genres) || !v.genres.length || v.genres.some(g=>!weeklyGenres.includes(g as WeeklyGenre)) || new Set(v.genres).size!==v.genres.length)throw Error('WEEKLY_CONFIG_INVALID: genres');
  const runTimes=v.runTimes;
  if(runTimes!==undefined && (!Array.isArray(runTimes) || runTimes.length<1 || runTimes.length>3 || !runTimes.includes('18:00') || new Set(runTimes).size!==runTimes.length || runTimes.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))))throw Error('WEEKLY_CONFIG_INVALID: 1..3 distinct times including 18:00');
  if(continuous&&(!runTimes||maxArticles!==1||intervalDays!==1))throw Error('WEEKLY_CONFIG_INVALID: continuous uses daily slots, one article each');
  const op={id:v.id,startsAt:new Date(start).toISOString(),endsAt:continuous?null:new Date(end).toISOString(),dailyAt,...(runTimes?{runTimes:[...runTimes].sort()}:{}),intervalDays:Number(intervalDays),maxArticles:Number(maxArticles),genres:v.genres as WeeklyGenre[],...(continuous?{continuous:true}:{})};
  if(!weeklySlots(op,start).length)throw Error('WEEKLY_CONFIG_INVALID: no run inside window');
  return op;
}
export function weeklySlots(op:WeeklyOperation,now=Date.now()) {
  const slots:Array<{day:string;dueAt:string}>=[];
  const start=Date.parse(op.startsAt),windowStart=op.continuous?Math.max(start,Date.parse(`${jstDay(now)}T00:00:00+09:00`)):start;
  const end=op.continuous?windowStart+8*dayMs:operationEnd(op),date=jstDay(windowStart);
  if(op.runTimes){
    const first=Date.parse(`${date}T00:00:00+09:00`);
    // Recover the most recent slot on first startup, recording its actual late start.
    const latestPast=op.runTimes.map(t=>Date.parse(`${date}T${t}:00+09:00`)).filter(d=>d<=start).at(-1);
    for(let d=first;d<end;d+=op.intervalDays*dayMs)for(const t of op.runTimes){
      const day=new Date(d+offset).toISOString().slice(0,10),due=Date.parse(`${day}T${t}:00+09:00`);
      if(due<end && (due>=start || (!op.continuous&&due===latestPast)))slots.push({day:`${day}@${t}`,dueAt:new Date(due).toISOString()});
    }return slots;
  }
  let due=Date.parse(`${date}T${op.dailyAt}:00+09:00`);
  if(due<start)due+=dayMs;
  for(;due<end;due+=op.intervalDays*dayMs)slots.push({day:new Date(due+offset).toISOString().slice(0,10),dueAt:new Date(due).toISOString()});
  return slots;
}
