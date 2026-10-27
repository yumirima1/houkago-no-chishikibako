"use client";

import { useEffect, useRef, useState } from "react";
import { initialRoomSound, RoomAudio, type SoundLayer } from "./roomAudio";
import styles from "./observer-room.module.css";

const sounds: { id: SoundLayer; label: string }[] = [{ id: "music", label: "ローファイ" }, { id: "rain", label: "雨音" }, { id: "city", label: "街の遠音" }];

export function RoomControls({ windowOpen, onWindowChange }: { windowOpen: boolean; onWindowChange: () => void }) {
  const engine = useRef<RoomAudio | null>(null);
  const windowRef = useRef(windowOpen);
  const [sound, setSound] = useState(initialRoomSound);
  useEffect(() => { windowRef.current = windowOpen; engine.current?.window(windowOpen); }, [windowOpen]);
  useEffect(() => () => { engine.current?.dispose(); engine.current = null; }, []);
  function audio() {
    if (!engine.current) { engine.current = new RoomAudio(setSound); engine.current.window(windowRef.current); }
    return engine.current;
  }
  return <details className={styles.roomControls}>
    <summary>部屋の音と窓</summary>
    <div className={styles.controlBody}>
      <div className={styles.windowControl}><span>引き違い窓 · {windowOpen ? "開いています" : "閉じています"}</span><button type="button" aria-pressed={windowOpen} onClick={onWindowChange}>{windowOpen ? "窓を閉める" : "窓を開ける"}</button></div>
      {sounds.map(({ id, label }) => <div key={id} className={styles.soundControl}>
        <div><span>{label}</span><span role="status">{sound[id].status === "playing" ? "再生中" : sound[id].status === "starting" ? "準備中…" : sound[id].status === "error" ? "再生できません" : "停止中"}</span><button type="button" aria-label={`${label}を${sound[id].status === "playing" || sound[id].status === "starting" ? "停止" : "再生"}`} aria-pressed={sound[id].status === "playing"} onClick={() => void audio().play(id, sound[id].status !== "playing" && sound[id].status !== "starting")}>{sound[id].status === "playing" || sound[id].status === "starting" ? "停止" : "再生"}</button></div>
        <label><span>{label}の音量</span><input type="range" min="0" max="100" step="1" aria-label={`${label}の音量`} value={Math.round(sound[id].volume * 100)} onChange={(event) => audio().volume(id, Number(event.target.value) / 100)} /><output>{Math.round(sound[id].volume * 100)}%</output></label>
        {sound[id].error && <p role="alert">{sound[id].error}</p>}
      </div>)}
      <p>オリジナルの合成音。窓を開けると外の音が近づきます。雨音は天候と別に選べます。</p>
    </div>
  </details>;
}
