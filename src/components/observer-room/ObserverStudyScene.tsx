"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { CameraController } from "./CameraController";
import { NightCity } from "./NightCity";
import { NightStudy } from "./NightStudy";
import { ROOM_CAMERA } from "./roomMotion";
import type { NightWeather } from "@/lib/observer-weather";

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

export function ObserverStudyScene({ onOpen, interactive, focused, paused, reducedMotion, weather, windowOpen, onWindowToggle }: {
  onOpen: () => void; interactive: boolean; focused: boolean; paused: boolean; reducedMotion: boolean; weather: NightWeather; windowOpen: boolean; onWindowToggle: () => void;
}) {
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => true);
  const [hovered, setHovered] = useState(false);
  const [ready, setReady] = useState(false);
  const handleReady = useCallback(() => setReady(true), []);
  // The modal covers the scene. Resume rendering for the closing animation.
  return <div style={{ position: "absolute", inset: 0 }}><Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.5]} frameloop={visible && !paused ? reducedMotion ? "demand" : "always" : "never"} style={{ cursor: hovered && interactive ? "pointer" : "default" }}
    camera={{ position: [...ROOM_CAMERA.position], fov: 42, near: 0.1, far: 100 }}
    gl={{ antialias: true, stencil: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
    onCreated={({ camera, gl }) => {
      camera.lookAt(...ROOM_CAMERA.target);
      gl.shadowMap.type = THREE.PCFShadowMap;
    }}>
    <color attach="background" args={["#101a21"]} />
    <CameraController active={interactive} focused={focused} reducedMotion={reducedMotion} />
    <hemisphereLight args={["#9bb1c6", "#30281e", 0.75]} />
    <ambientLight color="#a6b6c3" intensity={0.25} />
    <pointLight position={[0, 3.2, 3.5]} color="#d8c9ae" intensity={6} distance={10} decay={2} />
    <directionalLight position={[-4, 5, -0.8]} color="#88a9ce" intensity={1.1} />
    <pointLight position={[2.2, 2.7, -0.5]} distance={3.8} decay={2} intensity={1.1} color="#c7b28c" />
    <spotLight position={[-1.3, 2.05, -0.55]} angle={0.95} penumbra={0.8} intensity={12}
      color="#ffd099" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.001} />
    <Suspense fallback={null}>
      <NightCity reducedMotion={reducedMotion} weather={weather} />
      <NightStudy onOpen={() => { setHovered(false); onOpen(); }} enabled={interactive} onHover={setHovered} weather={weather} reducedMotion={reducedMotion} windowOpen={windowOpen} onWindowToggle={onWindowToggle} />
      <SceneReady onReady={handleReady} />
    </Suspense>
  </Canvas>{!ready && <div role="status" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#101a21", color: "#c7c8b8", fontSize: 12, pointerEvents: "none" }}>部屋を準備しています…</div>}</div>;
}
