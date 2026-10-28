"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ObserverDesktop } from "./ObserverDesktop";
import { useRoomWeather } from "./useRoomWeather";
import { RoomControls } from "./RoomControls";
import { createRoomSession, type RoomSession } from "./roomSession";
import { useRoomSound } from "./useRoomSound";
import styles from "./observer-room.module.css";

const ObserverStudyScene = dynamic(() => import("./ObserverStudyScene").then((module) => module.ObserverStudyScene), {
  ssr: false, loading: () => <RoomLoading />,
});
const subscribeClient = () => () => {};
let supported: boolean | undefined;
function webGLSupport() {
  if (supported !== undefined) return supported;
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    supported = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { supported = false; }
  return supported;
}
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const mobileQuery = "(max-width: 760px), (max-width: 1024px) and (pointer: coarse)";
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia(mobileQuery); query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function RoomLoading() { return <div className={styles.loading} role="status">部屋を準備しています…</div>; }
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function ObserverStudyRoot() {
  const [session, setSession] = useState<RoomSession | null>(null);
  const initialSession = useRef<RoomSession | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [windowMoving, setWindowMoving] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const autoOpened = useRef(false);
  const [phase, setPhase] = useState<"room" | "opening" | "desktop" | "closing">("room");
  const phaseRef = useRef(phase);
  const monitorButton = useRef<HTMLButtonElement>(null);
  const weather = useRoomWeather();
  const sound = useRoomSound(session, windowOpen, weather.mode);
  const webGL = useSyncExternalStore(subscribeClient, webGLSupport, () => null);
  const mobile = useSyncExternalStore(subscribeViewport, () => window.matchMedia(mobileQuery).matches, () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const ready = useCallback(() => setSceneReady(true), []);
  const windowSettled = useCallback(() => setWindowMoving(false), []);
  useEffect(() => {
    initialSession.current ??= createRoomSession();
    const initial = initialSession.current; let active = true;
    queueMicrotask(() => { if (active) { setSession(initial); setWindowOpen(initial.windowOpen); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!mobile || autoOpened.current || !session || !(sceneReady || webGL === false)) return;
    const timer = setTimeout(() => {
      if (autoOpened.current) return;
      autoOpened.current = true;
      if (phaseRef.current === "room") { phaseRef.current = "opening"; setPhase("opening"); }
    }, reducedMotion ? 300 : 900);
    return () => clearTimeout(timer);
  }, [mobile, session, sceneReady, webGL, reducedMotion]);
  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const timer = setTimeout(() => {
      const next = phase === "opening" ? "desktop" : "room";
      phaseRef.current = next; setPhase(next);
      if (next === "room") monitorButton.current?.focus({ preventScroll: true });
    }, reducedMotion ? 120 : phase === "opening" ? mobile ? 1600 : 950 : mobile ? 650 : 600);
    return () => clearTimeout(timer);
  }, [phase, reducedMotion, mobile]);
  function open() {
    if (phaseRef.current !== "room") return;
    if (mobile) autoOpened.current = true;
    phaseRef.current = "opening"; setPhase("opening");
  }
  function close() {
    if (phaseRef.current !== "desktop") return;
    phaseRef.current = "closing"; setPhase("closing");
  }
  function toggleWindow() { setWindowMoving(!reducedMotion && webGL === true); setWindowOpen(value => !value); }
  const openDesktop = phase !== "room";
  const fallback = <div className={styles.unavailable}><p>この環境では3Dの部屋を表示できません。</p><button type="button" onClick={open}>端末を開く</button><button type="button" onClick={() => window.location.reload()}>再試行</button></div>;
  return <div className={styles.room} data-phase={phase} data-device={mobile ? "phone" : "desktop"} data-initial-window={session ? session.windowOpen ? "open" : "closed" : "pending"} data-initial-music={session ? session.musicWanted ? "on" : "off" : "pending"} data-weather={weather.mode} data-weather-status={weather.status} data-window={windowOpen ? "open" : "closed"} data-window-motion={windowMoving ? windowOpen ? "opening" : "closing" : windowOpen ? "open" : "closed"}>
    <div inert={openDesktop} className={styles.scene}>
      {webGL === null || !session ? <RoomLoading /> : webGL ? <SceneBoundary fallback={fallback}>
        <ObserverStudyScene onOpen={open} onReady={ready} mobile={mobile} phase={phase} interactive={!openDesktop} focused={!mobile && (phase === "opening" || phase === "desktop")} paused={phase === "desktop" && !windowMoving} reducedMotion={reducedMotion} weather={weather.mode} windowOpen={windowOpen} onWindowToggle={toggleWindow} onWindowSettled={windowSettled} />
      </SceneBoundary> : fallback}
      <button ref={monitorButton} type="button" className={mobile ? styles.mobileEntry : styles.keyboardEntry} onClick={open} aria-haspopup="dialog">{mobile ? "端末を開く" : "CRTモニターを開く"}</button>
      {session && <RoomControls sound={sound} windowOpen={windowOpen} windowMoving={windowMoving} onWindowChange={toggleWindow} />}
    </div>
    {openDesktop && (!mobile || phase !== "opening") && <ObserverDesktop onClose={close} mobile={mobile} phase={phase} weather={weather} sound={sound} windowOpen={windowOpen} windowMoving={windowMoving} onWindowToggle={toggleWindow} />}
  </div>;
}
