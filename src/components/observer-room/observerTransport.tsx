export const staticResearch=process.env.NEXT_PUBLIC_RESEARCH_STATIC==='1';
const asset=(value:string)=>`${process.env.NEXT_PUBLIC_BASE_PATH??''}${value}`;
export const snapshotUrl=()=>staticResearch?asset('/research/snapshot.json'):'/api/observer-room';
export const noteUrl=(id:string)=>staticResearch?asset(`/research/notes/${encodeURIComponent(id)}.json`):`/api/observer-room?note=${encodeURIComponent(id)}`;
export const downloadUrl=(id:string)=>staticResearch?asset(`/research/notes/${encodeURIComponent(id)}.md`):`/api/observer-room?note=${encodeURIComponent(id)}&download=1`;
export function genreName(genre:string|undefined){return ({ai:'AI・LLM',pc:'PC・ソフトウェア',economy:'経済・金融',world:'国際情勢',science:'科学・宇宙',culture:'文化・歴史',environment:'環境・エネルギー'} as Record<string,string>)[genre??'']??'';}
