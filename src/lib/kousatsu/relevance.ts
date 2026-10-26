import type { StoredItem } from './types';

const noise=new Set(('a an the and or but about after again also are as at be been before being brief by can clear comes could detailed did do does during each first for from had has have how in into is it its keep last latest may more most nasa news new not now of on one our out over plan provided said says should so some that their them there these they this those through time to today under united nations update was were what when where which who why will with within without women world would year years').split(' '));

export function meaningfulTerms(value: string) {
  const text=value.normalize('NFKC').replace(/https?:\/\/\S+/g,' ').replace(/&#\d+;|&[a-z]+;/gi,' ')
    .replace(/[’']s\b/gi,'').toLowerCase();
  return new Set([...new Intl.Segmenter('ja',{granularity:'word'}).segment(text)]
    .filter(part=>part.isWordLike).map(part=>part.segment)
    .filter(word=>!noise.has(word) && !/^\d+$/.test(word) && word.length<=50 &&
      (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(word) ? word.length>=2 : word.length>=3)));
}

export function compareRecords(left: Pick<StoredItem,'title'|'summary'|'publishedAt'|'canonicalUrl'>,
  right: Pick<StoredItem,'title'|'summary'|'publishedAt'|'canonicalUrl'>) {
  if(left.canonicalUrl && left.canonicalUrl===right.canonicalUrl) return {kind:'same_document',score:1,common:[],reason:'同じ正規化URLの文書・続版。内容の更新は文書版で比較する。'};
  const a=meaningfulTerms(left.title+' '+(left.summary ?? '').slice(0,400));
  const b=meaningfulTerms(right.title+' '+(right.summary ?? '').slice(0,400));
  const common=[...a].filter(word=>b.has(word));
  const union=new Set([...a,...b]);
  const score=common.length/Math.max(1,union.size);
  const named=common.filter(word=>new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(left.title) &&
    (new RegExp(`\\b${word.charAt(0).toUpperCase()+word.slice(1)}\\b`).test(left.title) || /\d/.test(word)));
  const gap=Math.abs(Date.parse(left.publishedAt ?? '')-Date.parse(right.publishedAt ?? ''))/86400000;
  if(common.length>=3 && named.length && gap<=14 && score>=0.15) return {kind:'follow_up_candidate',score,common,
    reason:`同一対象の続報候補。共通対象・動作語: ${common.join('、')} / 発表日の差${gap.toFixed(1)}日。同一事件の確定や因果関係の推定はしていない。`};
  if(common.length>=2 && (named.length || common.length>=3) && score>=0.09) return {kind:'same_issue_candidate',score,common,
    reason:`同じ問題・対象を扱う候補: ${common.join('、')}。主体・時点・出来事の一致は追加確認が必要。`};
  return {kind:common.length ? 'lexical_overlap' : 'unrelated',score,common,
    reason:common.length ? `語句一致のみ: ${common.join('、')}。研究上の関連性は不明。` : '具体的な対象・出来事の対応が不足。関連なし。'};
}
