"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import { WINDOW_OPENING } from "./roomLayout";
import { WindowGlassWeather } from "./WindowWeather";
import type { NightWeather } from "@/lib/observer-weather";

export function NightWindow({ open, onToggle, onSettled, onHover, enabled, reducedMotion, weather }: {
  open: boolean; onToggle: () => void; onSettled: () => void; onHover: (hover: boolean) => void; enabled: boolean; reducedMotion: boolean; weather: NightWeather;
}) {
  const sash = useRef<THREE.Group>(null);
  const width = (WINDOW_OPENING.right - WINDOW_OPENING.left) / 2, height = WINDOW_OPENING.top - WINDOW_OPENING.bottom;
  const y = (WINDOW_OPENING.top + WINDOW_OPENING.bottom) / 2;
  const [initialSlide] = useState(() => open ? -width + 0.12 : 0);
  const lastTarget = useRef(open), settled = useRef(true);
  useFrame((_, delta) => {
    if (!sash.current) return;
    const target = open ? -width + 0.12 : 0;
    if (lastTarget.current !== open) { lastTarget.current = open; settled.current = false; }
    sash.current.position.x = reducedMotion ? target : THREE.MathUtils.damp(sash.current.position.x, target, 3.1, Math.min(delta, 0.08));
    if (Math.abs(sash.current.position.x - target) < 0.008) {
      sash.current.position.x = target;
      if (!settled.current) { settled.current = true; queueMicrotask(onSettled); }
    }
  });
  const toggle = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (enabled && event.delta < 6) onToggle(); };
  const pane = (moving: boolean) => <group position={[WINDOW_OPENING.left + width * (moving ? 1.5 : 0.5), y, moving ? -1.76 : -1.88]}>
    {[-1, 1].map(side => <mesh key={`v${side}`} position={[side * (width - 0.07) / 2, 0, 0]} castShadow><boxGeometry args={[0.055, height, 0.075]} /><meshStandardMaterial color="#272c2b" roughness={0.68} /></mesh>)}
    {[-1, 1].map(side => <mesh key={`h${side}`} position={[0, side * (height - 0.05) / 2, 0]}><boxGeometry args={[width, 0.055, 0.075]} /><meshStandardMaterial color="#272c2b" /></mesh>)}
    <mesh position={[0, 0.045, 0]}><boxGeometry args={[width, 0.035, 0.07]} /><meshStandardMaterial color="#383d39" /></mesh>
    <mesh><planeGeometry args={[width - 0.08, height - 0.08]} /><meshPhysicalMaterial color="#91a7b4" transparent opacity={0.075} roughness={0.16} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <WindowGlassWeather width={width} height={height} weather={weather} />
    {moving && <mesh name="window-handle" position={[width / 2 - 0.13, -0.16, 0.07]}><boxGeometry args={[0.045, 0.24, 0.055]} /><meshStandardMaterial color="#b3aa91" metalness={0.55} roughness={0.4} /></mesh>}
  </group>;
  return <group name="interactive-sliding-window" onClick={toggle} onPointerOver={event => { event.stopPropagation(); if (enabled) onHover(true); }} onPointerOut={() => onHover(false)}>
    {/* Only this opening receives hits, including the open half. Furniture stays in front. */}
    <mesh position={[(WINDOW_OPENING.left + WINDOW_OPENING.right) / 2, y, -1.95]}><planeGeometry args={[width * 2, height]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {pane(false)}<group ref={sash} position-x={initialSlide} name="moving-window-sash">{pane(true)}</group>
  </group>;
}
