"use client";

import dynamic from "next/dynamic";
import { Component, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ObserverDesktop } from "./ObserverDesktop";
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

export function ObserverStudyRoot({ previewOnly = false }: { previewOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const monitorButton = useRef<HTMLButtonElement>(null);
  const webGL = useSyncExternalStore(subscribeClient, webGLSupport, () => null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia("(prefers-reduced-motion: reduce)").matches, () => false);
  const fallback = <div className={styles.unavailable}><p>この環境では3Dの部屋を表示できません。</p>{!previewOnly && <button type="button" onClick={() => setOpen(true)}>端末を開く</button>}<button type="button" onClick={() => window.location.reload()}>再試行</button></div>;
  function close() {
    setOpen(false);
    requestAnimationFrame(() => monitorButton.current?.focus({ preventScroll: true }));
  }
  return <div className={styles.room}>
    <div inert={open} className={styles.scene}>
      {webGL === null ? <RoomLoading /> : webGL ? <SceneBoundary fallback={fallback}>
        <ObserverStudyScene onOpen={() => setOpen(true)} interactive={!open} terminalEnabled={!previewOnly} reducedMotion={reducedMotion} />
      </SceneBoundary> : fallback}
      {!previewOnly && <button ref={monitorButton} type="button" className={styles.keyboardEntry} onClick={() => setOpen(true)} aria-haspopup="dialog">CRTモニターを開く</button>}
    </div>
    {!previewOnly && open && <ObserverDesktop onClose={close} />}
  </div>;
}
