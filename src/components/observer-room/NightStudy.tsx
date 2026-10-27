"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomModel } from "./RoomAssets";
import { RetroMonitor } from "./RetroMonitor";
import { createWoodTexture, createPlasterTexture } from "./proceduralTextures";
import { WINDOW_OPENING, WORKSTATION_Z } from "./roomLayout";
import { WindowWeather } from "./WindowWeather";
import type { NightWeather } from "@/lib/observer-weather";
import { NightWindow } from "./NightWindow";
import { RoomFurnishings, EPaperPosters } from "./RoomFurnishings";

export function NightStudy({ onOpen, onHover, enabled, weather, reducedMotion, windowOpen, onWindowToggle }: { onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean; weather: NightWeather; reducedMotion: boolean; windowOpen: boolean; onWindowToggle: () => void }) {
  const textures = useMemo(() => ({ wood: createWoodTexture("#8d6240", "#3f281b"), plaster: createPlasterTexture() }), []);
  useEffect(() => () => { textures.wood.dispose(); textures.plaster.dispose(); }, [textures]);
  const wall = <meshStandardMaterial color="#394340" roughness={0.98} bumpMap={textures.plaster} bumpScale={0.025} />;
  const windowWidth = WINDOW_OPENING.right - WINDOW_OPENING.left;
  const windowHeight = WINDOW_OPENING.top - WINDOW_OPENING.bottom;
  const windowX = (WINDOW_OPENING.left + WINDOW_OPENING.right) / 2;
  const windowY = (WINDOW_OPENING.top + WINDOW_OPENING.bottom) / 2;
  const openComputer = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (enabled && event.delta < 6) onOpen(); };
  return <group name="night-study">
    {/* The back wall is built around a real opening; no scenery crosses it. */}
    <mesh position={[2.975, 2.1, -1.96]} receiveShadow><boxGeometry args={[4.05, 4.2, 0.18]} />{wall}</mesh>
    <mesh position={[-4.075, 2.1, -1.96]} receiveShadow><boxGeometry args={[1.85, 4.2, 0.18]} />{wall}</mesh>
    <mesh position={[windowX, 0.525, -1.96]} receiveShadow><boxGeometry args={[windowWidth, 1.05, 0.18]} />{wall}</mesh>
    <mesh position={[windowX, 3.75, -1.96]} receiveShadow><boxGeometry args={[windowWidth, 0.9, 0.18]} />{wall}</mesh>
    <mesh position={[-4.96, 2.1, 1.1]} receiveShadow><boxGeometry args={[0.18, 4.2, 6.2]} />{wall}</mesh>
    <mesh position={[0, 4.24, 1]} receiveShadow><boxGeometry args={[10, 0.08, 8]} /><meshStandardMaterial color="#2d3532" roughness={1} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 1]} receiveShadow><planeGeometry args={[10, 8]} /><meshStandardMaterial map={textures.wood} color="#61503e" roughness={0.86} /></mesh>
    {[WINDOW_OPENING.left, WINDOW_OPENING.right].map((x) => <mesh key={x} position={[x, windowY, -1.82]} castShadow><boxGeometry args={[0.085, windowHeight + 0.12, 0.22]} /><meshStandardMaterial color="#797465" roughness={0.72} /></mesh>)}
    {[WINDOW_OPENING.bottom, WINDOW_OPENING.top].map((y) => <mesh key={y} position={[windowX, y, -1.82]}><boxGeometry args={[windowWidth + 0.15, 0.08, 0.22]} /><meshStandardMaterial color="#797465" /></mesh>)}
    <mesh position={[windowX, 1.015, -1.68]} castShadow><boxGeometry args={[windowWidth + 0.25, 0.09, 0.46]} /><meshStandardMaterial map={textures.wood} color="#8a7359" /></mesh>
    <NightWindow open={windowOpen} onToggle={onWindowToggle} onHover={onHover} enabled={enabled} reducedMotion={reducedMotion} weather={weather} />
    <WindowWeather weather={weather} reducedMotion={reducedMotion} />
    <group position={[0, 0, WORKSTATION_Z]}>
    <RoomModel name="desk" position={[0, 0, -0.22]} size={[4.5, 0.86, 1.65]} finish="wood" wood={textures.wood} />
    <RetroMonitor onOpen={onOpen} onHover={onHover} enabled={enabled} />
    <group name="interactive-keyboard-mouse" onClick={openComputer} onPointerOver={(event) => { event.stopPropagation(); if (enabled) onHover(true); }} onPointerOut={() => onHover(false)}>
    <RoomModel name="computerKeyboard" position={[0.21, 0.86, 0.56]} size={[1.15, 0.1, 0.39]} finish="cream" />
    {Array.from({ length: 5 }, (_, row) => Array.from({ length: 13 }, (_, col) => <mesh key={`${row}-${col}`} position={[-0.3 + col * 0.076, 0.955 + (4 - row) * 0.003, 0.415 + row * 0.06]} castShadow>
      <boxGeometry args={[0.065, 0.017, 0.047]} /><meshStandardMaterial color={col % 6 === 0 ? "#938e7c" : "#c1b99e"} roughness={0.7} />
    </mesh>))}
    <RoomModel name="computerMouse" position={[1.03, 0.86, 0.52]} height={0.085} finish="cream" />
    </group>
    <RoomModel name="lampRoundTable" position={[-1.3, 0.86, -0.67]} height={1.15} finish="lamp" />
    <pointLight position={[-1.3, 1.73, -0.6]} color="#ffcb82" intensity={6} distance={4.8} decay={2} />
    <mesh position={[-1.3, 1.73, -0.6]}><sphereGeometry args={[0.055, 12, 8]} /><meshBasicMaterial color="#ffe1a7" toneMapped={false} /></mesh>
    {/* Open notebook, pen and ceramic cup sit directly on the desktop. */}
    <group position={[-1.12, 0.872, 0.48]} rotation={[0, 0.17, 0]}>
      <mesh castShadow><boxGeometry args={[0.75, 0.022, 0.49]} /><meshStandardMaterial color="#443e32" /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * 0.18, 0.016, 0]}><boxGeometry args={[0.35, 0.016, 0.46]} /><meshStandardMaterial color="#d5c8a5" /></mesh>)}
      {Array.from({ length: 8 }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-0.18, 0.026, -0.15 + i * 0.04]}><planeGeometry args={[0.26, 0.003]} /><meshStandardMaterial color="#83836b" /></mesh>)}
      <mesh position={[0.25, 0.045, 0.035]} rotation={[Math.PI / 2, 0.2, 0.15]}><cylinderGeometry args={[0.008, 0.008, 0.3, 8]} /><meshStandardMaterial color="#353a32" /></mesh>
    </group>
    <group position={[-1.93, 0.87, 0.25]}>
      <mesh><cylinderGeometry args={[0.15, 0.15, 0.018, 32]} /><meshStandardMaterial color="#a0957c" /></mesh>
      <mesh position={[0, 0.13, 0]} castShadow><cylinderGeometry args={[0.105, 0.09, 0.24, 32, 1, true]} /><meshStandardMaterial color="#a9a08a" side={THREE.DoubleSide} roughness={0.35} /></mesh>
      <mesh position={[0, 0.23, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.098, 32]} /><meshStandardMaterial color="#21190f" roughness={0.2} /></mesh>
      <mesh position={[0.12, 0.13, 0]}><torusGeometry args={[0.075, 0.018, 8, 20]} /><meshStandardMaterial color="#a9a08a" /></mesh>
    </group>
    </group>
    <RoomModel name="plantSmall1" position={[-2.65, 1.06, -1.68]} height={0.42} />
    <RoomModel name="bookcaseOpen" position={[3.25, 0, -1.52]} height={2.9} finish="wood" wood={textures.wood} />
    {[0.429, 1.22, 2.011, 2.802].map((height, i) => <RoomModel key={height} name="books" position={[3.25 + (i % 2 ? 0.12 : -0.1), height, -1.5]} height={0.32} />)}
    <EPaperPosters />
    <RoomFurnishings wood={textures.wood} onOpen={onOpen} onHover={onHover} enabled={enabled} />
  </group>;
}
