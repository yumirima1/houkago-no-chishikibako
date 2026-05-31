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
    changes.push("理系担当の発話に、仕組みやデータの視点を補いました。");
    return `${line.text} 仕組みとして見ると、ここが大事です。`;
  }

  if (line.id === "bunkei" && !/たとえ|疑問|でも|なぜ|でしょう|ですね/.test(line.text)) {
    changes.push("文系担当の発話に、疑問や例えの視点を補いました。");
    return `${line.text} たとえるなら、私たちの日常の迷いにも近いですね。`;
  }

  return line.text;
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
        roleSeparation: "理系担当は仕組み、文系担当は疑問と例えの役割を確認しました。",
        naturalConversation: "同じ話者が続く箇所を警告として記録します。",
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
