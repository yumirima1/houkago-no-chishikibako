import { readableTitle } from "./terminalFormat";

export type DocumentBlock = { kind: "paragraph" | "heading" | "quote" | "code" | "metadata"; text: string; level?: number }
  | { kind: "list"; items: string[]; ordered: boolean };

// A small, text-only Markdown view. Raw HTML is always text; no innerHTML or remote embeds.
export function documentBlocks(markdown: string, title: string): DocumentBlock[] {
  const lines = markdown.replaceAll("\r", "").split("\n"), blocks: DocumentBlock[] = [];
  let i = 0;
  if (lines[0]?.startsWith("# ") && readableTitle(lines[0].slice(2).trim()) === readableTitle(title.trim())) i++;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("```")) {
      const text: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith("```")) text.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ kind: "code", text: text.join("\n") }); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { blocks.push({ kind: "heading", level: Math.max(2, heading[1].length), text: heading[2] }); i++; continue; }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [], ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
      blocks.push({ kind: "list", items, ordered }); continue;
    }
    if (line.startsWith(">")) {
      const text: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) text.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: text.join("\n") }); continue;
    }
    const text: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|>|```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) text.push(lines[i++]);
    blocks.push({ kind: blocks.length === 0 && /^(作成|生成|ジャンル):/.test(line) ? "metadata" : "paragraph", text: text.join("\n") });
  }
  return blocks;
}
