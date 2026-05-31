import path from "node:path";

import {
  draftDir,
  ensureProductionDirs,
  getStringArg,
  listJsonFiles,
  parseArgs,
  writeJsonFile,
} from "./lib/episode-fs";
import { EpisodeScript } from "./lib/episode-schema";

function inferThemes(title: string, theme: string) {
  const text = `${title} ${theme}`;
  const themes = new Set<string>();

  if (/AI|人工知能/i.test(text)) themes.add("AI");
  if (/量子|宇宙|科学/.test(text)) themes.add("科学");
  if (/コンピュータ|プログラミング|技術/.test(text)) themes.add("コンピュータ");
  if (/心理|陰謀論|信じ/.test(text)) themes.add("心理学");
  if (/哲学|考え|意識|思考/.test(text)) themes.add("哲学");
  if (themes.size === 0) themes.add("知識");

  return [...themes];
}

async function createSequentialEpisodeId() {
  const files = await listJsonFiles(draftDir);
  const existingNumbers = files
    .map((file) => path.basename(file, ".json").match(/^episode-(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

  return `episode-${String(nextNumber).padStart(3, "0")}`;
}

function buildTemplateScript(options: {
  id: string;
  title: string;
  theme: string;
  durationTargetMinutes: number;
  description: string;
  themes: string[];
}): EpisodeScript {
  const now = new Date().toISOString();

  return {
    ...options,
    createdAt: now,
    updatedAt: now,
    speakers: [
      {
        id: "rikei",
        name: "理系担当",
        voice: "rikei",
        text: `今日は「${options.theme}」を、仕組みの側から整理してみます。まず大事なのは、言葉の印象だけで判断しないことです。`,
      },
      {
        id: "bunkei",
        name: "文系担当",
        voice: "bunkei",
        text: "なるほど。でも、仕組みが分かっても、私たちが日常で感じる疑問はまだ残りそうですね。",
      },
      {
        id: "rikei",
        name: "理系担当",
        voice: "rikei",
        text: "その通りです。科学や技術の説明では、できることと、まだ分かっていないことを分けて話す必要があります。",
      },
      {
        id: "bunkei",
        name: "文系担当",
        voice: "bunkei",
        text: "たとえるなら、地図を持つことと、実際に街を歩くことの違いに近いかもしれません。",
      },
      {
        id: "rikei",
        name: "理系担当",
        voice: "rikei",
        text: "今回のテーマも、断定しすぎず、データや研究で言える範囲から見ていくのがよさそうです。",
      },
      {
        id: "bunkei",
        name: "文系担当",
        voice: "bunkei",
        text: "聞き終わったあとに、少しだけ考え続けられるくらいの余白があるといいですね。",
      },
    ],
  };
}

async function main() {
  await ensureProductionDirs();

  const args = parseArgs();
  const title = getStringArg(args, "title", "AIは本当に考えているのか")!;
  const theme = getStringArg(args, "theme", "AIと思考")!;
  const id = getStringArg(args, "id") ?? (await createSequentialEpisodeId());
  const durationTargetMinutes = Number(getStringArg(args, "minutes", "5"));
  const description =
    getStringArg(args, "description") ??
    `${title}について、理系担当と文系担当が静かな会話形式で考えます。`;
  const themes =
    getStringArg(args, "themes")
      ?.split(",")
      .map((themeName) => themeName.trim())
      .filter(Boolean) ?? inferThemes(title, theme);
  const script = buildTemplateScript({
    id,
    title,
    theme,
    durationTargetMinutes,
    description,
    themes,
  });
  const outputPath = path.join(draftDir, `${id}.json`);

  await writeJsonFile(outputPath, script);
  console.log(`Draft script created: ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
