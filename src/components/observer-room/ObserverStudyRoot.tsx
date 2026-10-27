"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ObserverDesktop } from "./ObserverDesktop";
import { useRoomWeather } from "./useRoomWeather";
import { RoomControls } from "./RoomControls";
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
function RoomLoading() { return <div className={styles.loading} role="status">部屋を準備しています…</div>; }
class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function ObserverStudyRoot() {
  const [windowOpen, setWindowOpen] = useState(false);
  const [phase, setPhase] = useState<"room" | "opening" | "desktop" | "closing">("room");
  const phaseRef = useRef(phase);
  const monitorButton = useRef<HTMLButtonElement>(null);
  const weather = useRoomWeather();
  const webGL = useSyncExternalStore(subscribeClient, webGLSupport, () => null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const timer = setTimeout(() => {
      const next = phase === "opening" ? "desktop" : "room";
      phaseRef.current = next; setPhase(next);
      if (next === "room") monitorButton.current?.focus({ preventScroll: true });
    }, reducedMotion ? 120 : phase === "opening" ? 950 : 600);
    return () => clearTimeout(timer);
  }, [phase, reducedMotion]);
  function open() {
    if (phaseRef.current !== "room") return;
    phaseRef.current = "opening"; setPhase("opening");
  }
  function close() {
    if (phaseRef.current !== "desktop") return;
    phaseRef.current = "closing"; setPhase("closing");
  }
  const openDesktop = phase !== "room";
  const fallback = <div className={styles.unavailable}><p>この環境では3Dの部屋を表示できません。</p><button type="button" onClick={open}>端末を開く</button><button type="button" onClick={() => window.location.reload()}>再試行</button></div>;
  return <div className={styles.room} data-phase={phase} data-weather={weather.mode} data-weather-status={weather.status} data-window={windowOpen ? "open" : "closed"}>
    <div inert={openDesktop} className={styles.scene}>
      {webGL === null ? <RoomLoading /> : webGL ? <SceneBoundary fallback={fallback}>
        <ObserverStudyScene onOpen={open} interactive={!openDesktop} focused={phase === "opening" || phase === "desktop"} paused={phase === "desktop"} reducedMotion={reducedMotion} weather={weather.mode} windowOpen={windowOpen} onWindowToggle={() => setWindowOpen(value => !value)} />
      </SceneBoundary> : fallback}
      <button ref={monitorButton} type="button" className={styles.keyboardEntry} onClick={open} aria-haspopup="dialog">CRTモニターを開く</button>
      <RoomControls windowOpen={windowOpen} onWindowChange={() => setWindowOpen(value => !value)} />
    </div>
    {openDesktop && <ObserverDesktop onClose={close} phase={phase} weather={weather} />}
  </div>;
}
