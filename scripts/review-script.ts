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

  if (!speakers.some((line) => detourPattern.test(line.text))) {
    warnings.push("会話内に脱線や実体験風の寄り道がありません。深夜ラジオとして自然な遠回りを入れてください。");
  }

  const rikeiChars = tartaruLines.reduce((total, line) => total + line.text.length, 0);
  const bunkeiChars = kanaLines.reduce((total, line) => total + line.text.length, 0);
  const totalChars = rikeiChars + bunkeiChars;

  if (totalChars > 0) {
    const rikeiRatio = rikeiChars / totalChars;

    if (rikeiRatio < 0.42 || rikeiRatio > 0.58) {
      warnings.push("タルタルとかなの会話量が偏っています。会話比率はおおむね50:50に近づけてください。");
    }
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
        naturalConversation: "同じ話者の連続、締めの重複、冒頭と最後の問いの重複、かなの相槌偏重、反論、脱線、説明過多、理解の余白不足、タルタルの決め台詞化したまとめ表現を警告として記録します。",
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
