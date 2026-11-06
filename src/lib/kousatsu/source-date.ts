/** Preserve the precision of an attributed calendar date. A number elsewhere
 * in a sentence (including the word "One") is not evidence for a calendar day. */
export function sourceDatePrecisionSupported(source:string,text:string){
 const dates:Array<{year:number|null;month:number;day:number}>=[];
 for(const m of source.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g))dates.push({year:m[1]?Number(m[1]):null,month:Number(m[2]),day:Number(m[3])});
 for(const m of source.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g))dates.push({year:Number(m[1]),month:Number(m[2]),day:Number(m[3])});
 const months='Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
 const monthNumber=(v:string)=>['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(v.toLowerCase().slice(0,3))+1;
 for(const m of source.matchAll(new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,'gi')))dates.push({year:m[3]?Number(m[3]):null,month:monthNumber(m[1]),day:Number(m[2])});
 for(const m of source.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})\\.?(?:,?\\s+(\\d{4}))?\\b`,'gi')))dates.push({year:m[3]?Number(m[3]):null,month:monthNumber(m[2]),day:Number(m[1])});
 return [...text.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g)].every(m=>dates.some(d=>d.month===Number(m[2])&&d.day===Number(m[3])&&(!m[1]||d.year===Number(m[1]))));
}
