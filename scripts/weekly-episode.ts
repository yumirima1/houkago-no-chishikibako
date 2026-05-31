import path from "node:path";

import {
  contentRoot,
  ensureProductionDirs,
  readJsonFile,
  toProjectPath,
  writeJsonFile,
} from "./lib/episode-fs";

type ProgramMemory = {
  pastTopics?: Array<{ episodeId: string; tags: string[]; title: string }>;
  recurringPhrases?: string[];
  runningJokes?: string[];
  surprisingNews?: Array<{ note: string; requiresHumanCheck?: boolean }>;
};

function nextSundayAt3am(from = new Date()) {
  const jstNow = new Date(
    from.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
  );
  const next = new Date(jstNow);
  const day = next.getDay();
  const daysUntilSunday = (7 - day) % 7;

  next.setDate(next.getDate() + daysUntilSunday);
  next.setHours(3, 0, 0, 0);

  if (next <= jstNow) {
    next.setDate(next.getDate() + 7);
  }

  return next;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 03:00 JST`;
}

async function readProgramMemory() {
  try {
    return await readJsonFile<ProgramMemory>(
      path.join(contentRoot, "memory", "program-memory.json"),
    );
  } catch {
    return {};
  }
}

async function main() {
  await ensureProductionDirs();

  const memory = await readProgramMemory();
  const nextUpdate = nextSundayAt3am();
  const candidates = [
    {
      title: "雨の日に考える、ネットはなぜ炎上をやめられないのか",
      theme: "炎上と心理学",
      type: "regular",
      durationType: "normal",
      needsHumanCheck: false,
      tags: ["心理学", "インターネット", "哲学"],
    },
    {
      title: "人生で一番驚いたニュース、AIが研究室を持ち始めた日",
      theme: "AIと研究の未来",
      type: "news",
      durationType: "normal",
      needsHumanCheck: true,
      tags: ["AI", "技術ニュース", "科学"],
    },
    {
      title: "その映画、実は未来予測だったのでは？",
      theme: "映画と未来予測",
      type: "movie",
      durationType: "normal",
      needsHumanCheck: false,
      tags: ["映画", "未来", "哲学"],
    },
  ];
  const plan = {
    nextUpdate: formatDate(nextUpdate),
    cadence: "毎週日曜 朝3時更新",
    candidates,
    memoryUsed: {
      recurringPhrase: memory.recurringPhrases?.[0],
      runningJoke: memory.runningJokes?.[0],
      pastTopicCount: memory.pastTopics?.length ?? 0,
    },
    humanCheckRequired:
      "ニュース、天気、映画の最新情報を扱う場合は、原稿生成前に人間が日付と出典を確認してください。",
    nextCommands: [
      "npm run episode:generate -- --title \"候補タイトル\" --theme \"候補テーマ\" --minutes 25 --themes \"AI,哲学\"",
      "npm run episode:review",
      "npm run episode:audio",
      "npm run episode:build",
    ],
  };
  const outputPath = path.join(contentRoot, "memory", "weekly-plan.json");

  await writeJsonFile(outputPath, plan);
  console.log(`Weekly plan created: ${toProjectPath(outputPath)}`);
  console.log(`Next update: ${plan.nextUpdate}`);
  console.log("Human check is required for latest news, weather, and movie references.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
