"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { CameraController } from "./CameraController";
import { NightCity } from "./NightCity";
import { NightStudy } from "./NightStudy";
import { ROOM_CAMERA } from "./roomMotion";

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

export function ObserverStudyScene({ onOpen, interactive, reducedMotion }: {
  onOpen: () => void; interactive: boolean; reducedMotion: boolean;
}) {
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const [hovered, setHovered] = useState(false);
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  return <div style={{ position: "absolute", inset: 0 }}><Canvas shadows dpr={[1, 1.5]} frameloop={visible ? "always" : "never"} style={{ cursor: hovered && interactive ? "pointer" : "default" }}
    camera={{ position: [...ROOM_CAMERA.position], fov: 42, near: 0.1, far: 100 }}
    gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
    onCreated={({ camera, gl }) => {
      camera.lookAt(...ROOM_CAMERA.target);
      gl.shadowMap.type = THREE.PCFShadowMap;
    }}>
    <color attach="background" args={["#101a21"]} />
    <CameraController active={interactive} reducedMotion={reducedMotion} />
    <hemisphereLight args={["#9bb1c6", "#30281e", 0.55]} />
    <ambientLight color="#a6b6c3" intensity={0.16} />
    <directionalLight position={[-4, 5, -0.8]} color="#88a9ce" intensity={1.1} />
    <spotLight position={[-1.3, 2.05, -0.55]} angle={0.95} penumbra={0.8} intensity={12}
      color="#ffd099" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.001} />
    <Suspense fallback={null}>
      <NightCity reducedMotion={reducedMotion} />
      <NightStudy onOpen={() => { setHovered(false); onOpen(); }} enabled={interactive} onHover={setHovered} />
      <SceneReady onReady={handleReady} />
    </Suspense>
  </Canvas>{!ready && <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#101a21", color: "#c7c8b8", fontSize: 12, pointerEvents: "none" }}>部屋を準備しています…</div>}</div>;
}
