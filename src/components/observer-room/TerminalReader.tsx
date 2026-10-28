"use client";

import { useEffect, useRef } from "react";
import type { ResearchNote } from "@/lib/kousatsu/runtime-types";
import type { CollectedNews } from "./desktopTypes";
import { date, safeSourceUrl, readableTitle } from "./terminalFormat";
import { ResearchDocument } from "./ResearchDocument";
import { downloadUrl, staticResearch } from "./observerTransport";
import styles from "./observer-room.module.css";

export function TerminalReader({ noteId, note, noteError, news, createdAt, onRetry, onPrevious, onBack, onClose }: {
  noteId: string | null; note: ResearchNote | null; noteError: { id: string; text: string } | null; news?: CollectedNews; createdAt: string | null;
  onRetry: () => void; onPrevious: (id: string) => void; onBack: () => void; onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null), scroll = useRef<HTMLElement>(null);
  const ready = noteId ? note?.id === noteId : Boolean(news);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [noteId, news?.id, ready]);
  return <div className={styles.readingShell}>
    <header className={styles.readingHeader}>
      <button type="button" onClick={onBack} aria-label="一覧に戻る">← 一覧に戻る</button>
      <span>{noteId ? "考察を読む" : "出典を読む"}</span>
      <button type="button" onClick={onClose} aria-label="本文を閉じて部屋に戻る">部屋へ</button>
    </header>
    <article ref={scroll} className={styles.fullReader} aria-label={noteId ? "考察本文" : "収集ニュース本文"} aria-busy={!ready && !noteError}>
      <div className={styles.readingColumn}>
        <p className={styles.readingEyebrow}>KOUSATSU BAKO / {noteId ? "RESEARCH" : "SOURCE"}</p>
        <h1 id="reader-heading" ref={heading} tabIndex={-1}>{readableTitle(noteId ? ready ? note!.title : "考察を開いています" : news?.title ?? "記事を開いています")}</h1>
        {noteId ? noteError?.id === noteId ? <div className={styles.readerError} role="alert"><p>{noteError.text}</p><button type="button" onClick={onRetry}>本文を再読込</button></div>
          : !ready ? <p role="status">本文を開いています…</p>
          : <>
            <p className={styles.readingMeta}>{date(createdAt)}</p>
            <p className={styles.readingNotice}>生成された考察です。出典の主張と見解を区別してお読みください。独立した事実確認は未実施です。</p>
            {note!.generation && <p className={styles.readingNotice}>生成方式: {note!.generation.origin === "model" ? "モデルによる考察" : note!.generation.origin === "mixed" ? "モデルとルール分析の併用" : "根拠に基づくルール分析"}{note!.generation.issues.length > 0 && <>。モデルの制約・エラー: {note!.generation.issues.join(" / ")}</>}</p>}
            {note!.artifact === "conflict" && <p className={styles.readingNotice}>保存先に編集された内容があります。この画面ではDB内の記録を表示し、保存先を変更しません。</p>}
            <ResearchDocument markdown={note!.markdown} title={note!.title} />
            <footer className={styles.readingSources}>
              <h2>出典・関連情報</h2>
              {note!.sources?.map(source => safeSourceUrl(source.url) && <p key={source.url}><a href={safeSourceUrl(source.url)!} target="_blank" rel="noopener noreferrer">出典: {readableTitle(source.title)} ↗</a></p>)}
              {note!.revisionOf && <p><button type="button" onClick={() => onPrevious(note!.revisionOf!)}>前の考察を開く</button></p>}
              <a href={downloadUrl(note!.id)} download>Markdownをダウンロード ↓</a>
            </footer>
          </>
          : news && <>
            <p className={styles.readingMeta}>{news.source} · 公開 {date(news.publishedAt)} · 収集 {date(news.fetchedAt)}</p>
            <p className={styles.readingNotice}>収集時に保存された情報です。記事の主張について独立した事実確認は行っていません。</p>
            <div className={styles.readingText}>{news.content || news.summary || "この記事の本文・要約は保存されていません。"}</div>
            {news.truncated && <p className={styles.readingNotice}>{staticResearch ? "公開用の短い抜粋を表示しています。全文は出典から確認できます。" : "長い記事のため、保存本文の先頭40,000文字を表示しています。"}</p>}
            {safeSourceUrl(news.url) && <footer className={styles.readingSources}><a href={safeSourceUrl(news.url)!} target="_blank" rel="noopener noreferrer">元の記事を開く ↗</a></footer>}
          </>}
      </div>
    </article>
  </div>;
}
