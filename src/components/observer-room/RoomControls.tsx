"use client";

import type { RoomSoundController } from "./useRoomSound";
import styles from "./observer-room.module.css";

export function RoomControls({ windowOpen, windowMoving = false, onWindowChange, sound, inline = false }: {
  windowOpen: boolean; windowMoving?: boolean; onWindowChange: () => void; sound: RoomSoundController; inline?: boolean;
}) {
  const music = sound.state.music, ambient = sound.state.city;
  const playing = music.status === "playing" || music.status === "starting";
  return <details className={`${styles.roomControls} ${inline ? styles.inlineControls : ""}`}>
    <summary>部屋の音と窓{sound.needsGesture && <span className={styles.soundWaiting}>音は待機中</span>}</summary>
    <div className={styles.controlBody}>
      <div className={styles.windowControl}><span>窓 · {windowMoving ? windowOpen ? "開けています…" : "閉めています…" : windowOpen ? "開いています" : "閉じています"}</span><button type="button" aria-pressed={windowOpen} onClick={onWindowChange}>{windowOpen ? "窓を閉める" : "窓を開ける"}</button></div>
      {sound.needsGesture && <button type="button" className={styles.enableSound} onClick={sound.activate}>音を有効にする</button>}
      <div className={styles.soundControl}>
        <div><span>ローファイ</span><span role="status">{music.status === "playing" ? "再生中" : music.status === "starting" ? "準備中…" : music.status === "blocked" ? "操作を待っています" : music.status === "error" ? "再生できません" : "停止中"}</span><button type="button" aria-label={`ローファイを${playing ? "停止" : "再生"}`} aria-pressed={music.status === "playing"} onClick={sound.toggleMusic}>{playing ? "停止" : "再生"}</button></div>
        <label><span>ローファイの音量</span><input type="range" min="0" max="100" step="1" aria-label="ローファイの音量" value={Math.round(music.volume * 100)} onChange={event => sound.setMusicVolume(Number(event.target.value) / 100)} /><output>{Math.round(music.volume * 100)}%</output></label>
        {music.status === "error" && <p role="alert">{music.error}</p>}
      </div>
      <div className={styles.ambientControl}><span>外の音 · {ambient.status === "playing" ? windowOpen ? "窓のすぐ外に" : "窓越しに、控えめに" : "停止中"}</span><button type="button" onClick={sound.toggleAmbient} aria-pressed={ambient.status === "playing"}>{ambient.status === "playing" || ambient.status === "starting" ? "外の音を止める" : "外の音を聴く"}</button></div>
      {ambient.status === "error" && <p role="alert">{ambient.error}</p>}
      <p>外の音は窓と天候に合わせて変わります。音楽・雨・街の遠音はオリジナルの合成音です。</p>
    </div>
  </details>;
}
