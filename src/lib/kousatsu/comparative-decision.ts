// Reuses the archived comparison24 design. Share the scenario/outcome instead
// of asking a model to invent low-level controls that may contradict an option.
const fields=['利用場面','優先案','比較案','達成したい結果'] as const;
export function renderComparativeDecision(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key as typeof fields[number])))throw Error('DECISION_COMPARISON_INVALID');
  const raw=value as Record<typeof fields[number],unknown>;
  const labels={} as Record<typeof fields[number],string>;
  for(const key of fields){const value=raw[key];
    if(typeof value!=='string')throw Error('DECISION_COMPARISON_INVALID');
    const text=value.trim().replace(/。$/,'');
    if(text.length<3||text.length>100||!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)||/[\r\n。！？]|https?:\/\/|\b[EDMC]\d+\b/.test(text))throw Error('DECISION_COMPARISON_INVALID');
    labels[key]=text;
  }
  const scenario=labels.利用場面,a=labels.優先案,b=labels.比較案,goal=labels.達成したい結果;
  const comparable=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}]/gu,'');
  if(comparable(a)===comparable(b))throw Error('DECISION_OPTIONS_IDENTICAL');
  if(/単なる|単に|ただの|だけの|漫然と/.test(a+b))throw Error('DECISION_STRAWMAN_OPTION');
  if([a,b].some(option=>comparable(option)===comparable(goal))||/(?:比較|検証|評価|採用|優先|設計|特定|解明)(?:する|すること|したい)?$/.test(goal))throw Error('DECISION_RESULT_NOT_OUTCOME');
  return {
    issue:`仮に「${scenario}」を想定するなら、「${goal}」を得るには、「${a}」と「${b}」のどちらを先に行うべきか。`,
    position:`私は、仮に「${scenario}」を想定するなら、「${goal}」のために、「${b}」より「${a}」を優先したい。`,
    alternative:`一方、逆に、もし「${scenario}」という同じ場面で「${goal}」を得られるかを共通の基準として比べ、「${b}」の方が「${a}」よりよい結果を得るなら、比較案を優先する説明も成り立つ。これは未確認の仮説である。`,
    revisionCondition:`もし、同じ「${scenario}」で同じ「${goal}」を基準に両案の結果を比べ、「${a}」が「${b}」を上回らないと分かるなら、優先案の相対的な便益という前提が弱まるため、この見解の優先順位を下げる。`,
    assumption:`仮に「${scenario}」では、「${a}」の方が「${b}」より「${goal}」をよく達成できると仮定する。実測した効果ではない。`,
  };
}
