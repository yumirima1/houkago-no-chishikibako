import {createHash} from 'node:crypto';

const allowedSections=new Set(['分析・考察','仮説と別の解釈','自律的なテーマ選択と研究課題','反証・矛盾の探索','参照した過去の考察','次の調査課題','不明点・限界','主記事と追加資料の日本語要約','追加資料の比較と信頼性','検証を待つ仮説','資料間の比較','過去の記憶の再評価','過去の知識との関連','次に確認すること']);
/** Publish saved reasoning, not private execution logs or full source bodies.
 * Safety redaction is explicit; the original immutable note is never rewritten. */
export function publicText(value:string){
  return value.replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g,'[認証情報を非公開]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]{8,}/gi,'[認証情報を非公開]')
    .replace(/\b(?:api[_-]?key|authorization|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"'。、]+/gi,'[認証情報を非公開]')
    .replace(/(?<![A-Za-z])[A-Z]:[\\/][^\s\n「」『』。)]+/gi,'[ローカル保存先を非公開]')
    .replace(/(?:\/Users\/|\/home\/)[^\s\n。)]+/g,'[ローカル保存先を非公開]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[連絡先を非公開]')
    .replace(/\b0\d{1,4}-\d{1,4}-\d{3,4}\b/g,'[連絡先を非公開]')
    .replace(/https?:\/\/[^\s)<>]+/g,url=>publicUrl(url)??'[非公開URL]')
    .replaceAll('<','〈').replaceAll('>','〉');
}
export function publicUrl(value:string){
  try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||/^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|[^.]+$)/i.test(u.hostname))return null;
    for(const key of [...u.searchParams.keys()])if(/token|secret|password|key|auth|signature/i.test(key))u.searchParams.delete(key);
    return u.href;
  }catch{return null;}
}
export function savedReasoning(markdown:string){
  let keep=false;const lines:string[]=[];
  for(const line of markdown.replaceAll('\r\n','\n').split('\n')){
    if(line.startsWith('## '))keep=allowedSections.has(line.slice(3).trim());
    if(keep)lines.push(line);
  }
  return publicText(lines.join('\n').trim());
}
export const originalNoteDigest=(markdown:string)=>createHash('sha256').update(markdown).digest('hex');
export function assertPublicSafety(files:Record<string,string>){
  for(const [name,value]of Object.entries(files)){
    if(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]{8,}|(?<![A-Za-z])[A-Z]:[\\/]|(?:\/Users\/|\/home\/)/i.test(value))throw Error(`PUBLIC_SAFETY_REJECTED:${name}`);
    if(/\b(?:api[_-]?key|authorization|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"'。、]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value))throw Error(`PUBLIC_SAFETY_REJECTED:${name}`);
  }
}
