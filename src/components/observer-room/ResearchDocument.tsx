import { createElement, type ReactNode } from "react";
import { readableTitle, safeSourceUrl } from "./terminalFormat";
import styles from "./observer-room.module.css";

import { documentBlocks } from "./markdownBlocks";

function inline(value: string): ReactNode[] {
  return value.split(/(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
    if (link && safeSourceUrl(link[2])) return <a key={index} href={safeSourceUrl(link[2])!} target="_blank" rel="noopener noreferrer">{readableTitle(link[1])}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{readableTitle(part.slice(2, -2))}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return readableTitle(part);
  });
}

export function ResearchDocument({ markdown, title }: { markdown: string; title: string }) {
  return <div className={styles.readingText} data-document-content>{documentBlocks(markdown, title).map((block, index) => {
    if (block.kind === "list") return createElement(block.ordered ? "ol" : "ul", { key: index }, block.items.map((item, n) => <li key={n}>{inline(item)}</li>));
    if (block.kind === "heading") return createElement(`h${block.level}`, { key: index }, inline(block.text));
    if (block.kind === "quote") return <blockquote key={index}>{inline(block.text)}</blockquote>;
    if (block.kind === "code") return <pre key={index}><code>{block.text}</code></pre>;
    if (block.kind === "metadata") return <details key={index} className={styles.recordMetadata}><summary>記録の詳細</summary><p>{block.text}</p></details>;
    return <p key={index}>{inline(block.text)}</p>;
  })}</div>;
}
