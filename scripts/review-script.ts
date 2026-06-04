import path from "node:path";

import {
  draftDir,
  ensureProductionDirs,
  findLatestJsonFile,
  getStringArg,
  parseArgs,
  readJsonFile,
  reviewedDir,
  toProjectPath,
  writeJsonFile,
} from "./lib/episode-fs";
import {
  assertEpisodeScript,
  EpisodeScript,
  EpisodeSpeakerLine,
} from "./lib/episode-schema";

const riskyPhrases = [
  ["絶対に", "多くの場合"],
  ["必ず", "基本的には"],
  ["完全に証明されています", "有力な説明があります"],
  ["誰でも分かります", "順番に見れば分かりやすくなります"],
] as const;

const closingDeclarationPattern =
  /今日はこの(へん|辺)|では今日は|そろそろ終わ|また来週|おやすみ/;
const questionPattern = /[^。！？?]*[？?]/g;
const questionLinePattern = /[？?]/;
const simpleKanaBackchannelPattern =
  /^(なるほど|たしかに|そうなんだ)[。！？?、\s]*$/;
const kanaReactionPattern =
  /待って|いや|でも|本当|逆|怖|なんで|また始まった|人間そんな単純|それ本当|急に|ちょっと|好き|悔しい|妄想|つまり/;
const rebuttalPattern =
  /でも|本当|逆|決めつけ|それ本当|人間そんな単純|違う|いや待って/;
const detourPattern =
  /脱線|寄り道|全然関係|思い出|実体験|失敗|作るなら|たとえ|例えば|妄想|コーヒー|深夜/;
const tartaruMechanicPattern =
  /仕組み|技術|データ|構造|設計|実装|モデル|科学|コンピュータ|AI/;
const bannedTartaruTemplatePattern =
  /構造として見ると|ここが大事です|ここが大事|結局ここが大事/;
const shikumiTemplatePattern = /仕組みとして見ると/g;
const summaryTemplatePattern =
  /^(だから|つまり|要するに|結局|ここまで話して|最後に|今日の着地として).*(大事|必要|思う|という話)/;
const conversationalMarginPattern =
  /あー|えー|んー|うーん|いや待って|それさ|まあ|一回|ちょっと待|急に|冗談|笑|コーヒー|脱線|寄り道|例えば|たとえ/;
const informationDensityPattern =
  /AI|アルゴリズム|モデル|データ|学習|記憶|検索|SNS|通知|要約|仕組み|技術|構造|設計|実装|科学|脳|心理|社会|判断|責任|記録|履歴|生成|処理|分析/g;
const kanaConcernPattern =
  /怖|不安|分からない|わからない|変じゃない|それ変|大丈夫|嫌|しんど|つら|無理|置いていか/;
const tartaruAcknowledgementPattern =
  /分かる|わかる|たしかに|確かに|そうだね|それはある|その気持ち|怖さ|不安|無理ない|自然|一回受け止め|あー|んー|うん/;
const tartaruExplanationStartPattern =
  /^(技術|データ|AI|モデル|研究|歴史|心理学|科学|1950年代|まず|例えば|たとえば|要するに|つまり|結論|現時点|一般的)/;
const analogyMarkerPattern =
  /みたい|ような|ように|たとえるなら|例えるなら|例え|比喩|感じ/;
const repeatedOpeningPattern =
  /^(あー|うん|でも|そう|いや|つまり|要するに|たぶん|実は|面白いのがさ|ちょっと|最後に|ここで)/;
const draftGeneratorScaffoldPattern =
  /ここは知識を増やすというより|番組内の小さい記憶として置いておく|説明っぽくなりすぎないように言うと|ここは二人で、急がずに確かめる|生活の中でふと気になる場面から始める|会話の余白を作る|Seed event|cue|eventPlan|temperaturePlan/;
const draftTemplateLinePattern =
  /自分の感じ方だけ置いていかれる|理屈が勝ちすぎ|分かったことにされる|半分しか納得してない|きれいに進みすぎる|戻り方が雑|肩の力は抜けた|正解を出すというより/;
const kanaFixedStancePattern =
  /置いていかれる|理屈が勝ちすぎ|分かったことにされる|半分しか納得|納得してない|私だけ遅れてる/;
const tartaruLecturePattern =
  /^(まず|要するに|つまり|結論|一般的|現時点|研究|技術|データ|AI|モデル|仕組み|構造|科学|歴史|心理学)/;
const emotionalTexturePattern =
  /怖|不安|困る|嫌|しんど|つら|寂し|さみし|悔しい|好き|助かる|落ち着|疲れ|モヤモヤ|違和感|変じゃない|置いていか|眠れない|気になる/;
const humorTexturePattern =
  /笑|急に|また始まった|何それ|それ絶対|コーヒー|消しゴム|雑|悔しい|顔|変じゃない|何で|なんで|戻り方|やめて|ひどい/;
const nightAirPattern =
  /夜|深夜|寝る前|眠れない|雨|窓|机|コーヒー|布団|静か|明かり|ランプ|モニター|コンビニ|放送室|時計|作業/;

type ReviewConversationTemperature =
  | "warm"
  | "normal"
  | "deep"
  | "funny"
  | "quiet";

type DraftScriptEngineSource = {
  temperature?: ReviewConversationTemperature;
  temperaturePlan?: unknown;
};

function normalizeForSimilarity(text: string) {
  return text
    .replace(/[、。！？!?「」『』（）()\s]/g, "")
    .replace(/^(あー|えー|んー|うーん|でも|いや|そう|つまり|要するに|たぶん)/, "");
}

function bigrams(text: string) {
  const normalized = normalizeForSimilarity(text);
  const values = new Set<string>();

  for (let index = 0; index < normalized.length - 1; index += 1) {
    values.add(normalized.slice(index, index + 2));
  }

  return values;
}

function jaccardSimilarity(left: string, right: string) {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);

  if (leftBigrams.size === 0 || rightBigrams.size === 0) return 0;

  let intersection = 0;

  for (const value of leftBigrams) {
    if (rightBigrams.has(value)) intersection += 1;
  }

  const union = new Set([...leftBigrams, ...rightBigrams]).size;

  return intersection / union;
}

function countRepeatedValues(values: string[], minCount: number) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count >= minCount);
}

function getSentenceEnding(text: string) {
  const normalized = text.trim().replace(/[。！？!?]+$/, "");
  const match = normalized.match(/(.{4,12})$/);

  return match?.[1] ?? "";
}

function ensureReadableText(text: string, changes: string[]) {
  let nextText = text.replace(/\s+/g, " ").trim();

  for (const [from, to] of riskyPhrases) {
    if (nextText.includes(from)) {
      nextText = nextText.replaceAll(from, to);
      changes.push(`断定的な表現「${from}」を「${to}」へ調整しました。`);
    }
  }

  if (nextText.length > 92 && nextText.includes("、")) {
    const commaIndex = nextText.indexOf("、", 36);

    if (commaIndex > -1) {
      nextText = `${nextText.slice(0, commaIndex)}。${nextText.slice(commaIndex + 1)}`;
      changes.push("長い一文を音読しやすい長さへ分けました。");
    }
  }

  if (!/[。！？]$/.test(nextText)) {
    nextText = `${nextText}。`;
    changes.push("文末に読み上げ用の句点を追加しました。");
  }

  return nextText;
}

function reinforceSpeakerRole(line: EpisodeSpeakerLine, changes: string[]) {
  if (
    line.id === "rikei" &&
    !/仕組み|データ|科学|技術|研究|モデル|コンピュータ|AI/.test(line.text)
  ) {
    changes.push("理系担当の発話は、決め台詞を足さず自然な話し言葉のまま確認しました。");
  }

  if (line.id === "bunkei" && !/待って|でも|それ|ちょっと|なんで|本当|急に|分かる/.test(line.text)) {
    changes.push("文系担当の発話は、定型の哲学変換を追加せずリスナー目線として確認しました。");
  }

  return line.text;
}

function normalizeQuestion(question: string) {
  return question.replace(/\s+/g, "").replace(/[？?]+$/, "");
}

function extractQuestions(text: string) {
  return [...text.matchAll(questionPattern)]
    .map((match) => normalizeQuestion(match[0]))
    .filter((question) => question.length >= 8);
}

function checkProgramQualityRules(
  speakers: EpisodeSpeakerLine[],
  warnings: string[],
) {
  const firstClosingIndex = speakers.findIndex((line) =>
    closingDeclarationPattern.test(line.text),
  );
  const closingCount = speakers.filter((line) =>
    closingDeclarationPattern.test(line.text),
  ).length;

  if (closingCount > 1) {
    warnings.push("締めの宣言が複数回あります。エンディングは1回だけにしてください。");
  }

  if (firstClosingIndex > -1 && firstClosingIndex < speakers.length - 2) {
    warnings.push("エンディング宣言後に会話が続いています。新しい本題を始めていないか確認してください。");
  }

  const openingQuestions = extractQuestions(
    speakers.slice(0, 6).map((line) => line.text).join(" "),
  );
  const endingQuestions = extractQuestions(
    speakers.slice(-6).map((line) => line.text).join(" "),
  );
  const repeatedQuestion = openingQuestions.find((openingQuestion) =>
    endingQuestions.includes(openingQuestion),
  );

  if (repeatedQuestion) {
    warnings.push("冒頭の問いと最後の問いが同じです。最後は視点を一段変えた問いにしてください。");
  }

  const simpleKanaBackchannels = speakers.filter(
    (line) =>
      line.id === "bunkei" && simpleKanaBackchannelPattern.test(line.text),
  );

  if (simpleKanaBackchannels.length > 0) {
    warnings.push("かなが単純な相槌だけで返している箇所があります。ツッコミ、驚き、反論、勘違い、ボケに変えてください。");
  }

  const tartaruLines = speakers.filter((line) => line.id === "rikei");
  const kanaLines = speakers.filter((line) => line.id === "bunkei");
  const questionLines = speakers.filter((line) =>
    questionLinePattern.test(line.text),
  );
  const emotionalLines = speakers.filter((line) =>
    emotionalTexturePattern.test(line.text),
  );
  const humorLines = speakers.filter((line) => humorTexturePattern.test(line.text));
  const nightAirLines = speakers.filter((line) => nightAirPattern.test(line.text));
  const longTartaruLines = tartaruLines.filter((line) => line.text.length > 280);
  const longExplanationLines = speakers.filter(
    (line) => line.text.length > 240 && tartaruMechanicPattern.test(line.text),
  );
  const kanaReactiveLines = kanaLines.filter((line) =>
    kanaReactionPattern.test(line.text),
  );
  const mechanicOnlyTartaruLines = tartaruLines.filter(
    (line) =>
      tartaruMechanicPattern.test(line.text) &&
      !detourPattern.test(line.text) &&
      line.text.length > 180,
  );
  const bannedTartaruTemplateLines = tartaruLines.filter((line) =>
    bannedTartaruTemplatePattern.test(line.text),
  );
  const shikumiTemplateCount = tartaruLines.reduce(
    (count, line) => count + (line.text.match(shikumiTemplatePattern)?.length ?? 0),
    0,
  );
  const summaryTemplateLines = tartaruLines.filter((line) =>
    summaryTemplatePattern.test(line.text.trim()),
  );
  const draftTemplateLines = speakers.filter((line) =>
    draftTemplateLinePattern.test(line.text),
  );

  if (questionLines.length < Math.max(2, Math.floor(speakers.length * 0.12))) {
    warnings.push("会話内の疑問が少なめです。かなの生活目線の問い、タルタルの言い淀み、二人の確認を増やしてください。");
  }

  if (emotionalLines.length < Math.max(3, Math.floor(speakers.length * 0.14))) {
    warnings.push("感情の手触りが少なめです。怖さ、不安、好き、悔しさ、助かった感じなど、知識ではなく人の反応を増やしてください。");
  }

  if (humorLines.length < Math.max(2, Math.floor(speakers.length * 0.08))) {
    warnings.push("小さな笑いが少なめです。ボケ、言い間違い、生活の小物、タルタルの変な例えを一つ足してください。");
  }

  if (nightAirLines.length < Math.max(3, Math.floor(speakers.length * 0.1))) {
    warnings.push("深夜の放送室の気配が少なめです。雨、窓、机、布団、モニター、時計、静かな間などを会話に自然に混ぜてください。");
  }

  if (draftTemplateLines.length > Math.max(2, Math.floor(speakers.length * 0.14))) {
    warnings.push("Draft由来の会話テンプレが多めです。同じ違和感の言い換えではなく、その回固有の場面、反論、笑いへ置き換えてください。");
  }

  if (bannedTartaruTemplateLines.length > 0) {
    warnings.push("タルタルの決め台詞化したまとめ表現があります。「構造として見ると」「ここが大事です」「結局ここが大事」は原則使わず、具体例や比喩で話を進めてください。");
  }

  if (shikumiTemplateCount > 1) {
    warnings.push("「仕組みとして見ると」が複数回出ています。タルタルの口癖にせず、流れと明確につながる場面だけにしてください。");
  }

  if (summaryTemplateLines.length > Math.max(2, Math.floor(tartaruLines.length * 0.12))) {
    warnings.push("タルタルの締め・まとめセリフが同じ型に寄っています。結論テンプレではなく、その場の具体例や会話の流れから自然に着地してください。");
  }

  if (longTartaruLines.length > Math.max(2, Math.floor(tartaruLines.length * 0.12))) {
    warnings.push("タルタルの長い説明が多めです。説明、脱線、失敗談、短い雑談を交互にしてください。");
  }

  for (let index = 0; index < speakers.length - 1; index += 1) {
    const current = speakers[index];
    const next = speakers[index + 1];
    const currentIsLongExplanation =
      current.text.length > 220 && tartaruMechanicPattern.test(current.text);
    const nextIsLongExplanation =
      next.text.length > 220 && tartaruMechanicPattern.test(next.text);

    if (
      currentIsLongExplanation &&
      nextIsLongExplanation &&
      !conversationalMarginPattern.test(current.text) &&
      !conversationalMarginPattern.test(next.text)
    ) {
      warnings.push("長い説明セリフが連続しています。大事な説明の間に短い相槌、言い淀み、冗談、ツッコミを挟んでください。");
      break;
    }
  }

  const denseInformationLines = speakers.filter((line) => {
    const matches = line.text.match(informationDensityPattern) ?? [];

    return matches.length >= 4 && line.text.length > 160;
  });

  if (denseInformationLines.length > Math.max(3, Math.floor(speakers.length * 0.16))) {
    warnings.push("情報密度が高い発話が多めです。リスナーが理解を追いつかせるための余白を増やしてください。");
  }

  for (let index = 0; index < speakers.length - 1; index += 1) {
    const current = speakers[index];
    const next = speakers[index + 1];
    const currentDenseTerms = current.text.match(informationDensityPattern) ?? [];
    const nextDenseTerms = next.text.match(informationDensityPattern) ?? [];
    const currentIsImportantExplanation =
      current.text.length > 180 && currentDenseTerms.length >= 3;
    const nextMovesToMoreInformation =
      next.text.length > 120 && nextDenseTerms.length >= 2;
    const nextHasMargin =
      next.id === "bunkei" &&
      (conversationalMarginPattern.test(next.text) ||
        kanaReactionPattern.test(next.text) ||
        rebuttalPattern.test(next.text));

    if (currentIsImportantExplanation && nextMovesToMoreInformation && !nextHasMargin) {
      warnings.push("重要な説明の直後に次の情報へ進んでいます。かなの反応、冗談、確認、軽い脱線を一度挟んでください。");
      break;
    }
  }

  if (
    longExplanationLines.length > 0 &&
    speakers.filter((line) => conversationalMarginPattern.test(line.text)).length <
      Math.ceil(longExplanationLines.length * 0.6)
  ) {
    warnings.push("長い説明に対して会話の間が少なめです。あー、えー、んー、いや待って、それさ、などを自然に使い、薄くならない範囲で余白を作ってください。");
  }

  if (mechanicOnlyTartaruLines.length > Math.max(3, Math.floor(tartaruLines.length * 0.18))) {
    warnings.push("タルタルが仕組み説明に寄りすぎています。技術好きの友達として脱線や興奮を混ぜてください。");
  }

  if (kanaReactiveLines.length < Math.ceil(kanaLines.length * 0.45)) {
    warnings.push("かなの反応角度が弱めです。ツッコミ、反論、驚き、妄想、勘違いを増やしてください。");
  }

  if (!speakers.some((line) => rebuttalPattern.test(line.text))) {
    warnings.push("会話内に明確な反論がありません。かな、またはタルタルが一度は疑う流れを入れてください。");
  }

  const detourLines = speakers.filter((line) => detourPattern.test(line.text));

  if (detourLines.length === 0) {
    warnings.push("会話内に脱線や実体験風の寄り道がありません。深夜ラジオとして自然な遠回りを入れてください。");
  } else if (detourLines.length < Math.max(2, Math.floor(speakers.length * 0.08))) {
    warnings.push("脱線や生活の寄り道が少なめです。説明の補助ではなく、二人が同じ部屋にいる感じを足してください。");
  }

  for (let index = 0; index < speakers.length - 1; index += 1) {
    const current = speakers[index];
    const next = speakers[index + 1];

    if (
      current.id === "bunkei" &&
      next.id === "rikei" &&
      kanaConcernPattern.test(current.text) &&
      tartaruExplanationStartPattern.test(next.text.trim()) &&
      !tartaruAcknowledgementPattern.test(next.text)
    ) {
      warnings.push("かなの怖さ、不安、分からなさを受け止めずに、タルタルが説明を開始している可能性があります。まず短く共感や確認を入れてください。");
      break;
    }
  }

  const analogyLines = speakers.filter((line) => analogyMarkerPattern.test(line.text));
  const repeatedAnalogyTerms = countRepeatedValues(
    analogyLines.flatMap((line) =>
      [...line.text.matchAll(/([一-龠ぁ-んァ-ヶA-Za-z0-9]{2,14})(みたい|のよう|ような|っぽい|感じ)/g)]
        .map((match) => match[1])
        .filter((value) => !/そう|こんな|そんな|どんな|同じ|少し|ちょっと/.test(value)),
    ),
    3,
  );

  if (
    analogyLines.length > Math.max(8, Math.floor(speakers.length * 0.22)) ||
    repeatedAnalogyTerms.length > 0
  ) {
    warnings.push("比喩が多い、または同じ例えが繰り返されています。テーマ固有の生活場面に絞り、同じ比喩パターンを減らしてください。");
  }

  const repeatedContentExists = speakers.some((line, index) =>
    speakers
      .slice(index + 1, index + 7)
      .some(
        (otherLine) =>
          line.id === otherLine.id &&
          line.text.length >= 34 &&
          otherLine.text.length >= 34 &&
          jaccardSimilarity(line.text, otherLine.text) > 0.72,
      ),
  );

  if (repeatedContentExists) {
    warnings.push("近い内容を言い換えて繰り返している可能性があります。前に進む展開、反論、具体例、沈黙の余白へ置き換えてください。");
  }

  const repeatedOpenings = countRepeatedValues(
    speakers
      .map((line) => line.text.trim().match(repeatedOpeningPattern)?.[1])
      .filter((value): value is string => Boolean(value)),
    8,
  );
  const repeatedEndings = countRepeatedValues(
    speakers
      .map((line) => getSentenceEnding(line.text))
      .filter((value) => value.length >= 4),
    5,
  );

  if (repeatedOpenings.length > 0 || repeatedEndings.length > 0) {
    warnings.push("同じ切り返し、同じ語尾、同じ決め台詞が多用されている可能性があります。発話の入り方と着地の型を散らしてください。");
  }

  const rikeiChars = tartaruLines.reduce((total, line) => total + line.text.length, 0);
  const bunkeiChars = kanaLines.reduce((total, line) => total + line.text.length, 0);
  const totalChars = rikeiChars + bunkeiChars;

  if (speakers.length < 40 || totalChars < 5000) {
    warnings.push("原稿量が短めです。通常回のたたき台なら、人間確認で会話の往復、間、脱線、着地を増やしてください。");
  }

  if (totalChars > 0) {
    const bunkeiRatio = bunkeiChars / totalChars;

    if (bunkeiRatio < 0.3) {
      warnings.push("かなの発言率が低すぎます。30〜45%を目安に、疑問、ツッコミ、反論、妄想、不安を増やしてください。");
    }

    if (bunkeiRatio > 0.45) {
      warnings.push("かなの発言率が高めです。30〜45%を目安にし、タルタルの具体例や技術好きの脱線も残してください。");
    }
  }
}

function isReviewConversationTemperature(
  value: unknown,
): value is ReviewConversationTemperature {
  return (
    value === "warm" ||
    value === "normal" ||
    value === "deep" ||
    value === "funny" ||
    value === "quiet"
  );
}

function getDraftScriptEngineSource(
  script: EpisodeScript,
): DraftScriptEngineSource | undefined {
  const source = (script as { source?: { draftScriptEngine?: unknown } }).source;
  const draftScriptEngine = source?.draftScriptEngine;

  if (!draftScriptEngine || typeof draftScriptEngine !== "object") {
    return undefined;
  }

  const draftSource = draftScriptEngine as Record<string, unknown>;

  return {
    temperature: isReviewConversationTemperature(draftSource.temperature)
      ? draftSource.temperature
      : undefined,
    temperaturePlan: draftSource.temperaturePlan,
  };
}

function countSameSpeakerRuns(speakers: EpisodeSpeakerLine[]) {
  let count = 0;

  for (let index = 1; index < speakers.length; index += 1) {
    if (speakers[index].id === speakers[index - 1].id) {
      count += 1;
    }
  }

  return count;
}

function checkDraftTemperatureRules(
  draftSource: DraftScriptEngineSource,
  speakers: EpisodeSpeakerLine[],
  warnings: string[],
) {
  const temperature = draftSource.temperature;
  const kanaLines = speakers.filter((line) => line.id === "bunkei");
  const tartaruLines = speakers.filter((line) => line.id === "rikei");
  const questionLines = speakers.filter((line) => questionLinePattern.test(line.text));
  const rebuttalLines = speakers.filter((line) => rebuttalPattern.test(line.text));
  const emotionalLines = speakers.filter((line) =>
    emotionalTexturePattern.test(line.text),
  );
  const humorLines = speakers.filter((line) => humorTexturePattern.test(line.text));
  const nightAirLines = speakers.filter((line) => nightAirPattern.test(line.text));
  const detourLines = speakers.filter((line) => detourPattern.test(line.text));
  const kanaFixedLines = kanaLines.filter((line) =>
    kanaFixedStancePattern.test(line.text),
  );
  const tartaruLectureLines = tartaruLines.filter(
    (line) =>
      tartaruLecturePattern.test(line.text.trim()) ||
      ((line.text.match(informationDensityPattern) ?? []).length >= 3 &&
        line.text.length > 130),
  );
  const sameSpeakerRuns = countSameSpeakerRuns(speakers);

  if (!temperature) {
    warnings.push("Draft Script Engine由来ですが、conversationTemperatureがsourceに記録されていません。SkeletonからDraft、generate-scriptまでの受け渡しを確認してください。");
  }

  if (!draftSource.temperaturePlan) {
    warnings.push("Draft Script Engine由来ですが、temperaturePlanがsourceに記録されていません。温度別テンポの意図がreviewで追跡できません。");
  }

  if (sameSpeakerRuns > Math.max(1, Math.floor(speakers.length * 0.03))) {
    warnings.push("Draftの同話者連続が多めです。タルタルの説明を短い往復へ分割し、かなの反応で一度止めてください。");
  }

  if (kanaFixedLines.length > Math.max(1, Math.floor(kanaLines.length * 0.14))) {
    warnings.push("かなの違和感が「置いていかれる」「理屈が勝ちすぎ」型に寄っています。その回固有の生活場面、反論、ズレた例えへ置き換えてください。");
  }

  if (
    questionLines.filter((line) => line.id === "bunkei").length +
      rebuttalLines.filter((line) => line.id === "bunkei").length <
    Math.max(3, Math.floor(kanaLines.length * 0.3))
  ) {
    warnings.push("かなが相槌や受け身に寄っています。疑問、反論、生活感のある止め方を増やしてください。");
  }

  if (tartaruLectureLines.length > Math.max(4, Math.floor(tartaruLines.length * 0.25))) {
    warnings.push("タルタルが講師化しています。定義や仕組みを連続させず、短い理屈、脱線、かなへの返答を交互にしてください。");
  }

  if (temperature === "warm") {
    if (emotionalLines.length < Math.max(5, Math.floor(speakers.length * 0.16))) {
      warnings.push("conversationTemperature=warm ですが、安心や生活感の反応が薄めです。帰ってきた感じを会話のやり取りで増やしてください。");
    }

    if (nightAirLines.length < Math.max(4, Math.floor(speakers.length * 0.12))) {
      warnings.push("conversationTemperature=warm ですが、夜の部屋の手触りが不足しています。雨、机、明かり、布団前の感覚を自然に足してください。");
    }
  }

  if (temperature === "deep") {
    if (questionLines.length < Math.max(4, Math.floor(speakers.length * 0.14))) {
      warnings.push("conversationTemperature=deep ですが、問いの層が少なめです。結論より、考えが残る確認を増やしてください。");
    }

    if (humorLines.length > Math.max(6, Math.floor(speakers.length * 0.2))) {
      warnings.push("conversationTemperature=deep に対して笑いの量が多めです。小さな笑いは残しつつ、沈黙と余韻へ寄せてください。");
    }
  }

  if (temperature === "funny") {
    if (humorLines.length < Math.max(4, Math.floor(speakers.length * 0.12))) {
      warnings.push("conversationTemperature=funny ですが、小さな笑いが足りません。ボケを増やすより、変な例えや生活のズレを会話内に置いてください。");
    }

    if (detourLines.length < Math.max(3, Math.floor(speakers.length * 0.1))) {
      warnings.push("conversationTemperature=funny ですが、脱線が弱めです。説明の補助ではない、短い寄り道を入れてください。");
    }
  }

  if (temperature === "quiet") {
    if (tartaruLectureLines.length > Math.max(3, Math.floor(tartaruLines.length * 0.18))) {
      warnings.push("conversationTemperature=quiet に対して説明密度が高めです。沈黙、言い淀み、短い確認を優先してください。");
    }

    if (nightAirLines.length < Math.max(5, Math.floor(speakers.length * 0.16))) {
      warnings.push("conversationTemperature=quiet ですが、静かな放送室の気配が不足しています。音、明かり、間を会話に混ぜてください。");
    }
  }

  if (temperature === "normal" && (detourLines.length === 0 || nightAirLines.length < 3)) {
    warnings.push("conversationTemperature=normal ですが、標準回としての脱線と深夜感が弱めです。便利な説明回に寄っていないか確認してください。");
  }
}

function reviewScript(script: EpisodeScript): EpisodeScript {
  const warnings: string[] = [];
  const changes: string[] = [];
  let previousSpeakerId: string | undefined;

  const speakers = script.speakers.map((line) => {
    if (line.id === previousSpeakerId) {
      warnings.push(`${line.name} の発話が連続しています。会話のテンポを確認してください。`);
    }

    previousSpeakerId = line.id;

    return {
      ...line,
      text: ensureReadableText(reinforceSpeakerRole(line, changes), changes),
    };
  });
  const hasRikei = speakers.some((line) => line.id === "rikei");
  const hasBunkei = speakers.some((line) => line.id === "bunkei");

  if (!hasRikei || !hasBunkei) {
    warnings.push("理系担当と文系担当の両方が含まれているか確認してください。");
  }

  checkProgramQualityRules(speakers, warnings);

  const draftScriptEngineSource = getDraftScriptEngineSource(script);

  if (draftScriptEngineSource) {
    warnings.push("Draft Script Engine由来のたたき台です。review通過後も、人間がSHOW_BIBLEに照らして会話の余白、脱線、関係性を確認してください。");
    checkDraftTemperatureRules(draftScriptEngineSource, speakers, warnings);

    if (speakers.some((line) => draftGeneratorScaffoldPattern.test(line.text))) {
      warnings.push("Draft Script Engineの足場文が本文に残っている可能性があります。cueの説明文ではなく、二人の自然な発話へ書き直してください。");
    }
  }

  const durationType = script.durationType ?? "normal";

  if (
    durationType === "normal" &&
    (script.durationTargetMinutes < 20 || script.durationTargetMinutes > 30)
  ) {
    warnings.push("通常回は20〜30分を目標にしてください。");
  }

  if (
    durationType === "long" &&
    (script.durationTargetMinutes < 60 || script.durationTargetMinutes > 90)
  ) {
    warnings.push("長尺回は60〜90分を目標にしてください。");
  }

  const now = new Date().toISOString();

  return {
    ...script,
    speakers,
    updatedAt: now,
    review: {
      reviewedAt: now,
      status: "reviewed",
      checks: {
        misinformationRisk: "断定表現を弱め、検証が必要な表現を残しにくくしました。",
        readability: "長すぎる文と余分な空白を簡易調整しました。",
        roleSeparation: "理系担当は仕組み、文系担当はリスナー目線と自然な反応の役割を確認しました。",
        naturalConversation: "同じ話者の連続、締めの重複、冒頭と最後の問いの重複、かなの相槌偏重と固定化、感情無視、疑問不足、感情不足、笑い不足、深夜感不足、反論、脱線、説明過多、温度不一致、理解の余白不足、比喩や内容の重複、テンプレ化した切り返し、タルタルの決め台詞化したまとめ表現を警告として記録します。",
        narrationEase: "句点と文の長さを読み上げ向けに整えました。",
      },
      warnings,
      changes: [...new Set(changes)],
    },
  };
}

async function resolveInputPath() {
  const args = parseArgs();
  const explicitInput = getStringArg(args, "input");
  const id = getStringArg(args, "id");

  if (explicitInput) return path.resolve(explicitInput);
  if (id) return path.join(draftDir, `${id}.json`);

  const latest = await findLatestJsonFile(draftDir);

  if (!latest) {
    throw new Error("No draft JSON found. Run npm run episode:generate first.");
  }

  return latest;
}

async function main() {
  await ensureProductionDirs();

  const inputPath = await resolveInputPath();
  const script = await readJsonFile<unknown>(inputPath);
  assertEpisodeScript(script);

  const reviewedScript = reviewScript(script);
  const outputPath = path.join(reviewedDir, `${reviewedScript.id}.json`);

  await writeJsonFile(outputPath, reviewedScript);
  console.log(`Reviewed script created: ${toProjectPath(outputPath)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
