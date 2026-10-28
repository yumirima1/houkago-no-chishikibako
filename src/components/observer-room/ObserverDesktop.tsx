"use client";

import { useEffect, useRef, useState } from "react";
import type { ResearchNote } from "@/lib/kousatsu/runtime-types";
import type { ObserverDesktopSnapshot } from "./desktopTypes";
import styles from "./observer-room.module.css";
import { DesktopClock } from "./DesktopClock";
import { TerminalReader } from "./TerminalReader";
import { SystemPanel } from "./SystemPanel";
import { RoomControls } from "./RoomControls";
import { EPaperSettings } from "./EPaper";
import type { RoomSoundController } from "./useRoomSound";
import { date, apiMessage, readableTitle } from "./terminalFormat";
import type { RoomWeather } from "@/lib/observer-weather";
import {snapshotUrl,noteUrl,genreName} from './observerTransport';

type App = "archive" | "news" | "system";
const APPS: { id: App; name: string; icon: string; subtitle: string }[] = [
  { id: "archive", name: "考察アーカイブ", icon: "▤", subtitle: "保存された問いと考察" },
  { id: "news", name: "収集ニュース", icon: "▥", subtitle: "出典とともに読む" },
  { id: "system", name: "システム", icon: "⚙", subtitle: "設定と稼働状況" },
];
export { safeSourceUrl } from "./terminalFormat";

export function ObserverDesktop({ onClose, phase, weather, mobile = false, sound, windowOpen = false, windowMoving = false, onWindowToggle }: { onClose: () => void; phase: "opening" | "desktop" | "closing"; weather: RoomWeather; mobile?: boolean; sound?: RoomSoundController; windowOpen?: boolean; windowMoving?: boolean; onWindowToggle?: () => void }) {
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
  const list = useRef<HTMLDivElement>(null);
  const listScroll = useRef({ archive: 0, news: 0 });
  const lastRecord = useRef<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(snapshotUrl(), { cache: "no-store", signal: controller.signal })
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
    fetch(noteUrl(noteId), { cache: "no-store", signal: controller.signal })
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
  useEffect(()=>{const timer=setInterval(()=>setRevision(v=>v+1),60000);return()=>clearInterval(timer);},[]);

  const reading = app === "archive" && noteId !== null || app === "news" && newsId !== null;
  const notes = snapshot?.notes.filter(item => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const news = snapshot?.news.filter(item => `${item.title} ${item.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const selectedNews = snapshot?.news.find(item => item.id === newsId);
  useEffect(() => {
    if (reading) return;
    const frame = requestAnimationFrame(() => {
      if (list.current && app && app !== "system") {
        list.current.scrollTop = listScroll.current[app];
        const button = Array.from(list.current.querySelectorAll("button")).find(button => button.dataset.recordId === lastRecord.current);
        button?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [reading, app]);
  function openApp(next: App) { setApp(next); setQuery(""); setNoteId(null); setNewsId(null); }
  function selectNote(id: string) { listScroll.current.archive = list.current?.scrollTop ?? listScroll.current.archive; lastRecord.current = id; setNoteId(id); setNoteError(null); }
  function selectNews(id: string) { listScroll.current.news = list.current?.scrollTop ?? listScroll.current.news; lastRecord.current = id; setNewsId(id); }
  function back() { setNoteId(null); setNewsId(null); }
  function reload() { setSnapshot(null); setError(""); setNoteId(null); setNote(null); setNewsId(null); setRevision(value => value + 1); }

  const appWindow = app ? <section className={styles.appWindow} aria-labelledby="app-heading">
    <div className={styles.windowTitle}><h1 ref={appHeading} tabIndex={-1} id="app-heading">{APPS.find(item => item.id === app)?.name}</h1><button type="button" onClick={() => setApp(null)} aria-label="アプリを閉じる">×</button></div>
    <div className={styles.toolbar}>
      {app !== "system" ? <input type="search" aria-label={app === "archive" ? "考察を検索" : "収集ニュースを検索"} placeholder="タイトルを検索…" value={query} onChange={event => setQuery(event.target.value)} /> : <span>保存されている設定と状態</span>}
      <button type="button" onClick={reload} disabled={!snapshot && !error}>再読込</button>
    </div>
    {app === "system" && !mobile && <EPaperSettings />}
    {error ? <div className={styles.empty} role="alert"><p>{error}</p><button type="button" onClick={reload}>再試行</button></div>
      : !snapshot ? <p className={styles.empty} role="status">保存された記録を読み込んでいます…</p>
      : app === "archive" ? <div ref={list} className={styles.recordList} aria-label="考察一覧">
        <p className={styles.listCaption}>最新 {snapshot.notes.length} 件から表示</p>
        {notes.length ? notes.map(item => <button type="button" key={item.id} data-record-id={item.id} onClick={() => selectNote(item.id)}>
          <small>{date(item.createdAt)} {genreName(item.genre)}</small><strong>{readableTitle(item.title)}</strong><span>考察を読む →</span>
        </button>) : <p className={styles.empty}>{query ? "一致する考察はありません。" : "保存された考察はまだありません。"}</p>}
      </div> : app === "news" ? <div ref={list} className={styles.recordList} aria-label="収集ニュース一覧">
        <p className={styles.listCaption}>収集済みの最新 {snapshot.news.length} 件</p>
        {news.length ? news.map(item => <button type="button" key={item.id} data-record-id={item.id} onClick={() => selectNews(item.id)}>
          <small>{item.source} · {genreName(item.genre)} · {date(item.publishedAt)}</small><strong>{readableTitle(item.title)}</strong><span>記事を読む →</span>
        </button>) : <p className={styles.empty}>{query ? "一致する記事はありません。" : "収集済みの記事はありません。"}</p>}
      </div> : <SystemPanel snapshot={snapshot} weather={weather} />}
  </section> : <div className={styles.welcome}>
    <div className={styles.welcomeMark} aria-hidden="true">▧</div><p>THE OBSERVER&apos;S ARCHIVE</p><h1>考察箱</h1><span>問いを残す。世界を読み直す。</span><hr /><small>アプリを選んで、保存された記録をひらく。</small>
  </div>;

  return <dialog ref={dialog} className={`${styles.monitorDialog} ${mobile ? styles.phoneDialog : ""} ${reading ? styles.fullReaderDialog : ""}`} data-phase={phase} data-device={mobile ? "phone" : "desktop"} data-screen={reading ? "reader" : app ?? "home"}
    aria-labelledby={reading ? "reader-heading" : "desktop-name"} aria-busy={phase !== "desktop"}
    onCancel={event => { event.preventDefault(); if (reading) back(); else onClose(); }}>
    <div inert={phase !== "desktop"} className={styles.terminalContents}>
      {reading ? <TerminalReader noteId={app === "archive" ? noteId : null} note={note} noteError={noteError} news={selectedNews} createdAt={snapshot?.notes.find(item => item.id === noteId)?.createdAt ?? null}
        onRetry={() => { setNoteError(null); setNote(null); setNoteAttempt(value => value + 1); }} onPrevious={id => { setNoteId(id); setNoteError(null); }} onBack={back} onClose={onClose} />
        : mobile ? <div className={styles.phoneFrame}>
          <div className={styles.phoneNotch} aria-hidden="true" />
          <header className={styles.phoneHeader}><div><small>PERSONAL ARCHIVE</small><strong id="desktop-name">考察箱</strong></div><DesktopClock /><button ref={returnButton} type="button" onClick={onClose} aria-label="モニターを閉じて部屋に戻る">部屋へ</button></header>
          <main className={styles.phoneBody}>
            {app ? appWindow : <div className={styles.phoneHome}>
              <p>窓辺から、世界の続きを。</p><h1>今日は、何を<br />考えよう。</h1>
              <nav className={styles.phoneApps} aria-label="端末のアプリ">{APPS.map(item => <button type="button" key={item.id} onClick={() => openApp(item.id)}><span aria-hidden="true">{item.icon}</span><div><strong>{item.name}</strong><small>{item.subtitle}</small></div><span aria-hidden="true">→</span></button>)}</nav>
              {sound && onWindowToggle && <RoomControls inline sound={sound} windowOpen={windowOpen} windowMoving={windowMoving} onWindowChange={onWindowToggle} />}
            </div>}
          </main><div className={styles.phoneHomeIndicator} aria-hidden="true" />
        </div> : <div className={styles.computerFrame}>
          <div className={styles.bezelLabel}><span>KOUSATSU / PERSONAL ARCHIVE</span><button ref={returnButton} type="button" className={styles.leave} onClick={onClose} aria-label="モニターを閉じて部屋に戻る">部屋に戻る <kbd>Esc</kbd></button></div>
          <div className={styles.desktopScreen}>
            <header className={styles.menuBar}><button type="button" onClick={() => { setApp(null); setQuery(""); }} aria-label="デスクトップに戻る">▧</button><strong id="desktop-name">考察箱</strong><span>Observer OS</span><span className={styles.menuRight}>PERSONAL ARCHIVE</span><DesktopClock /></header>
            <div className={styles.desktopBody}><nav className={styles.appDock} aria-label="端末のアプリ">{APPS.map(item => <button type="button" key={item.id} onClick={() => openApp(item.id)} aria-pressed={app === item.id}><span className={styles.appIcon} aria-hidden="true">{item.icon}</span><span>{item.name}</span></button>)}</nav>{appWindow}</div>
            <footer className={styles.taskbar}><span>▧　{app ? APPS.find(item => item.id === app)?.name : "デスクトップ"}</span><span>{snapshot ? "記録を読込済み" : error ? "接続を確認してください" : "記録を読込中"}</span></footer>
          </div><div className={styles.bottomBezel}><span>OBSERVER TERMINAL</span><span className={styles.powerLed} aria-hidden="true" /></div>
        </div>}
    </div>
  </dialog>;
}
