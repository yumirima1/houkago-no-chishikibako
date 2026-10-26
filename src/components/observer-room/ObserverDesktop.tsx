"use client";

import { useEffect, useRef, useState } from "react";
import type { ResearchNote } from "@/lib/kousatsu/runtime-types";
import type { ObserverDesktopSnapshot } from "./desktopTypes";
import styles from "./observer-room.module.css";
import { DesktopClock } from "./DesktopClock";
import { WeatherStatus } from "./WeatherStatus";
import type { RoomWeather } from "@/lib/observer-weather";
import { isPagesSite } from "@/lib/site-url";

type App = "archive" | "news" | "system";
const APPS: { id: App; name: string; icon: string; subtitle: string }[] = [
  { id: "archive", name: "考察アーカイブ", icon: "▤", subtitle: "保存された問いと考察" },
  { id: "news", name: "収集ニュース", icon: "▥", subtitle: "出典とともに読む" },
  { id: "system", name: "システム", icon: "⚙", subtitle: "設定と稼働状況" },
];
export function safeSourceUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function date(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "日時の記録なし";
  return new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function apiMessage(status: number) {
  return status === 403 ? "この端末はローカル環境で利用できます。本番起動時は既存のローカル閲覧設定を確認してください。"
    : "保存データを読み込めませんでした。時間をおいて再読込してください。";
}

export function ObserverDesktop({ onClose, phase, weather }: { onClose: () => void; phase: "opening" | "desktop" | "closing"; weather: RoomWeather }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const [app, setApp] = useState<App | null>(null);
  const [snapshot, setSnapshot] = useState<ObserverDesktopSnapshot | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [note, setNote] = useState<ResearchNote | null>(null);
  const [noteError, setNoteError] = useState<{ id: string; text: string } | null>(null);
  const [newsId, setNewsId] = useState<string | null>(null);
  const [noteAttempt, setNoteAttempt] = useState(0);
  const appHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  useEffect(() => {
    if (isPagesSite) return;
    const controller = new AbortController();
    fetch("/api/observer-room", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(apiMessage(response.status));
        const result: ObserverDesktopSnapshot = await response.json();
        if (!controller.signal.aborted) { setSnapshot(result); setError(""); }
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "保存データを読み込めませんでした。");
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!noteId) return;
    const controller = new AbortController();
    fetch(`/api/observer-room?note=${encodeURIComponent(noteId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "この考察が見つかりません。アーカイブを再読込してください。" : apiMessage(response.status));
        const result: ResearchNote = await response.json();
        if (!controller.signal.aborted) { setNote(result); setNoteError(null); }
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setNoteError({ id: noteId, text: reason instanceof Error ? reason.message : "本文を読み込めませんでした。" });
      });
    return () => controller.abort();
  }, [noteId, noteAttempt]);
  useEffect(() => { if (app) appHeading.current?.focus({ preventScroll: true }); }, [app]);
  useEffect(() => { if (phase === "desktop") returnButton.current?.focus({ preventScroll: true }); }, [phase]);

  const notes = snapshot?.notes.filter((item) => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const news = snapshot?.news.filter((item) => `${item.title} ${item.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const selectedNews = snapshot?.news.find((item) => item.id === newsId);
  function openApp(next: App) { setApp(next); setQuery(""); }
  function reload() { setSnapshot(null); setError(""); setNoteId(null); setNote(null); setNewsId(null); setRevision((value) => value + 1); }

  return <dialog ref={dialog} className={styles.monitorDialog} data-phase={phase} aria-labelledby="desktop-name" aria-busy={phase !== "desktop"}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className={styles.computerFrame} inert={phase !== "desktop"}>
      <div className={styles.bezelLabel}><span>KOUSATSU / PERSONAL ARCHIVE</span><button ref={returnButton} type="button" className={styles.leave} onClick={onClose} autoFocus aria-label="モニターを閉じて部屋に戻る">部屋に戻る <kbd>Esc</kbd></button></div>
      <div className={styles.desktopScreen}>
        <header className={styles.menuBar}>
          <button type="button" onClick={() => { setApp(null); setQuery(""); }} aria-label="デスクトップに戻る">▧</button>
          <strong id="desktop-name">考察箱</strong><span>Observer OS</span><span className={styles.menuRight}>{isPagesSite ? "OBSERVER TERMINAL" : "LOCAL ARCHIVE"}</span><DesktopClock />
        </header>
        <div className={styles.desktopBody}>
          <nav className={styles.appDock} aria-label="端末のアプリ">
            {APPS.map((item) => <button type="button" key={item.id} onClick={() => openApp(item.id)} aria-pressed={app === item.id}>
              <span className={styles.appIcon} aria-hidden="true">{item.icon}</span><span>{item.name}</span>
            </button>)}
          </nav>
          {app ? <section className={styles.appWindow} aria-labelledby="app-heading">
            <div className={styles.windowTitle}><h1 ref={appHeading} tabIndex={-1} id="app-heading">{APPS.find((item) => item.id === app)?.name}</h1><button type="button" onClick={() => setApp(null)} aria-label="アプリを閉じる">×</button></div>
            <div className={styles.toolbar}>
              {app !== "system" ? <input type="search" aria-label={app === "archive" ? "考察を検索" : "収集ニュースを検索"} placeholder="タイトルを検索…" value={query} onChange={(event) => setQuery(event.target.value)} /> : <span>保存されている設定と状態</span>}
              <button type="button" onClick={reload} disabled={!snapshot && !error}>再読込</button>
            </div>
            {isPagesSite ? <div className={styles.systemContent}><p>GitHub Pages公開版</p>{app === "system" && <WeatherStatus weather={weather} />}<p>保存済みの考察・ニュース・システム状態は、ローカルの端末で閲覧できます。この公開ページにはローカルデータを接続していません。</p></div>
              : error ? <div className={styles.empty} role="alert"><p>{error}</p><button type="button" onClick={reload}>再試行</button></div>
              : !snapshot ? <p className={styles.empty} role="status">保存された記録を読み込んでいます…</p>
              : app === "archive" ? <div className={styles.splitPane}>
                <div className={styles.recordList} aria-label="考察一覧">
                  <p className={styles.listCaption}>最新 {snapshot.notes.length} 件から表示</p>
                  {notes.length ? notes.map((item) => <button type="button" key={item.id} onClick={() => { setNoteId(item.id); setNoteError(null); }} aria-pressed={noteId === item.id}>
                    <small>{date(item.createdAt)}</small><strong>{item.title}</strong><span>{item.status} · {item.published ? "保存先あり" : "DB内の記録"}</span>
                  </button>) : <p className={styles.empty}>{query ? "一致する考察はありません。" : "保存された考察はまだありません。"}</p>}
                </div>
                <article className={styles.reader} aria-label="考察本文" aria-live="polite">
                  {!noteId ? <div className={styles.readerWelcome}><span aria-hidden="true">▤</span><h2>問いを、ひとつずつ。</h2><p>一覧から考察を選ぶと、保存された本文を読めます。</p></div>
                    : noteError?.id === noteId ? <div role="alert"><p>{noteError.text}</p><button type="button" onClick={() => { setNoteError(null); setNote(null); setNoteAttempt((value) => value + 1); }}>本文を再読込</button></div>
                    : note?.id !== noteId ? <p role="status">本文を開いています…</p>
                    : <><p className={styles.documentNotice}>生成された考察です。出典の主張と見解を区別してお読みください。独立した事実確認は未実施です。</p><h2>{note.title}</h2>
                      {note.artifact === "conflict" && <p className={styles.documentNotice}>保存先に編集された内容があります。この画面ではDB内の記録を表示し、保存先を変更しません。</p>}
                      <pre className={styles.markdown} tabIndex={0}>{note.markdown}</pre>
                      <a href={`/api/observer-room?note=${encodeURIComponent(note.id)}&download=1`} download>Markdownをダウンロード ↓</a></>}
                </article>
              </div> : app === "news" ? <div className={styles.splitPane}>
                <div className={styles.recordList} aria-label="収集ニュース一覧">
                  <p className={styles.listCaption}>収集済みの最新 {snapshot.news.length} 件</p>
                  {news.length ? news.map((item) => <button type="button" key={item.id} onClick={() => setNewsId(item.id)} aria-pressed={newsId === item.id}>
                    <small>{item.source} · {date(item.publishedAt)}</small><strong>{item.title}</strong>
                  </button>) : <p className={styles.empty}>{query ? "一致する記事はありません。" : "収集済みの記事はありません。"}</p>}
                </div>
                <article className={styles.reader} aria-label="収集ニュース本文">
                  {selectedNews ? <><p className={styles.eyebrow}>{selectedNews.source}</p><h2>{selectedNews.title}</h2><p className={styles.metadata}>公開 {date(selectedNews.publishedAt)}<br />収集 {date(selectedNews.fetchedAt)}</p>
                    <p className={styles.documentNotice}>収集時に保存された情報です。記事の主張について独立した事実確認は行っていません。</p>
                    <div className={styles.newsText}>{selectedNews.content || selectedNews.summary || "この記事の本文・要約は保存されていません。"}</div>
                    {selectedNews.truncated && <p>長い記事のため、保存本文の先頭40,000文字を表示しています。</p>}
                    {safeSourceUrl(selectedNews.url) && <a href={safeSourceUrl(selectedNews.url)!} target="_blank" rel="noopener noreferrer">元の記事を開く ↗</a>}</>
                    : <div className={styles.readerWelcome}><span aria-hidden="true">▥</span><h2>世界から届いた記録。</h2><p>一覧から収集済みの記事を選んでください。</p></div>}
                </article>
              </div> : <div className={styles.systemContent}>
                <WeatherStatus weather={weather} />
                <p className={styles.eyebrow}>SYSTEM INFORMATION</p><h2>ローカル調査の状態</h2><p className={styles.metadata}>取得日時 {date(snapshot.system.readAt)}</p>
                <dl className={styles.systemGrid}>
                  <dt>保存データ</dt><dd>{snapshot.initialized ? "既存のデータベースに接続" : "データベースは未初期化"}</dd>
                  <dt>バックグラウンド監視</dt><dd>{snapshot.system.supervisorActive ? "監視プロセスの応答あり" : "現在の応答を確認できません"}</dd>
                  <dt>調査ジョブ</dt><dd>{snapshot.worker.active ? "処理中" : "処理中のジョブなし"}</dd>
                  <dt>最終ワーカー応答</dt><dd>{date(snapshot.worker.lastSeenAt)}</dd>
                  <dt>巡回の確認間隔</dt><dd>{snapshot.system.pollSeconds} 秒</dd>
                  <dt>1サイクルの上限</dt><dd>{snapshot.system.maxJobsPerCycle} ジョブ</dd>
                  <dt>生成方式 / モデル</dt><dd>{snapshot.system.provider} / {snapshot.system.model}</dd>
                  <dt>端末のアクセス</dt><dd>読み取り専用</dd>
                </dl>
                <h3>設定された出典</h3><ul className={styles.sources}>{snapshot.sources.map((source) => <li key={source.id}><strong>{source.name}</strong><span>{source.enabled ? "収集対象" : "無効"} · {source.intervalMinutes} 分間隔</span></li>)}</ul>
                {!snapshot.sources.length && <p>出典は設定されていません。</p>}
                <h3>最近の処理</h3><ul className={styles.sources}>{snapshot.jobs.slice(0, 5).map((job) => <li key={job.id}><strong>{job.topic}</strong><span>{job.status}{job.stage ? ` / ${job.stage}` : ""}</span></li>)}</ul>
                {!snapshot.jobs.length && <p>処理履歴はありません。</p>}
              </div>}
          </section> : <div className={styles.welcome}>
            <div className={styles.welcomeMark} aria-hidden="true">▧</div><p>THE OBSERVER&apos;S ARCHIVE</p><h1>考察箱</h1><span>問いを残す。世界を読み直す。</span><hr /><small>アプリを選んで、保存された記録をひらく。</small>
          </div>}
        </div>
        <footer className={styles.taskbar}><span>▧　{app ? APPS.find((item) => item.id === app)?.name : "デスクトップ"}</span><span>{isPagesSite ? "公開版 · ローカルデータ未接続" : snapshot ? "記録を読込済み" : error ? "接続を確認してください" : "記録を読込中"}</span></footer>
      </div>
      <div className={styles.bottomBezel}><span>OBSERVER TERMINAL</span><span className={styles.powerLed} aria-hidden="true" /></div>
    </div>
  </dialog>;
}
