type CalendarMention={start:number;end:number;year:number|null;month:number;day:number|null};
const months='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const monthNumber=(v:string)=>['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(v.toLowerCase().slice(0,3))+1;
const normalize=(text:string)=>text.normalize('NFKC');
function calendarMentions(text:string){
 const mentions:CalendarMention[]=[];
 const add=(pattern:RegExp,fields:(m:RegExpMatchArray)=>Omit<CalendarMention,'start'|'end'>)=>{
  for(const m of text.matchAll(pattern)){
   const start=m.index!,end=start+m[0].length;
   if(!mentions.some(d=>start<d.end&&end>d.start))mentions.push({start,end,...fields(m)});
  }
 };
 // Longest forms first: a full date must never become a month-only match.
 add(/(?:(\d{4})年)?(\d{1,2})月(?:(\d{1,2})日)?/g,m=>({year:m[1]?Number(m[1]):null,month:Number(m[2]),day:m[3]?Number(m[3]):null}));
 add(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g,m=>({year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}));
 add(new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,'gi'),m=>({year:m[3]?Number(m[3]):null,month:monthNumber(m[1]),day:Number(m[2])}));
 add(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})\\.?(?:,?\\s+(\\d{4}))?\\b`,'gi'),m=>({year:m[3]?Number(m[3]):null,month:monthNumber(m[2]),day:Number(m[1])}));
 add(new RegExp(`\\b(${months})\\.?\\s+(?:of\\s+)?(\\d{4})\\b`,'gi'),m=>({year:Number(m[2]),month:monthNumber(m[1]),day:null}));
 return mentions;
}
function valid(d:CalendarMention){
 if(d.month<1||d.month>12||d.year!==null&&(d.year<1000||d.year>9999))return false;
 if(d.day===null)return true;
 const date=new Date(Date.UTC(d.year??2000,d.month-1,d.day));
 return date.getUTCMonth()===d.month-1&&date.getUTCDate()===d.day;
}
function supported(source:CalendarMention[],target:CalendarMention){
 return valid(target)&&source.some(d=>valid(d)&&d.month===target.month&&(target.day===null||d.day===target.day)&&(target.year===null||d.year===target.year));
}
/** Preserve source calendar precision without borrowing a day or year from unrelated numbers. */
export function sourceDatePrecisionSupported(source:string,text:string){
 const dates=calendarMentions(normalize(source));
 return calendarMentions(normalize(text)).every(d=>supported(dates,d));
}
/** November may justify 11月, but cannot justify 11 people or 11 months. */
export function withoutSupportedCalendarDates(source:string,text:string){
 const normalized=normalize(text),dates=calendarMentions(normalize(source));
 const mentions=calendarMentions(normalized).filter(d=>supported(dates,d)).sort((a,b)=>b.start-a.start);
 return mentions.reduce((value,d)=>value.slice(0,d.start)+' '+value.slice(d.end),normalized);
}
