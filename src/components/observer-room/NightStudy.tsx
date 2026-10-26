"use client";

import { RoundedBox } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomModel } from "./RoomAssets";
import { RetroMonitor } from "./RetroMonitor";
import { createWoodTexture, createPlasterTexture } from "./proceduralTextures";
import { WINDOW_OPENING, WORKSTATION_Z } from "./roomLayout";
import { WindowWeather } from "./WindowWeather";
import type { NightWeather } from "@/lib/observer-weather";

function WallPaper({ position, rotation = 0, space = false }: { position: [number, number, number]; rotation?: number; space?: boolean }) {
  return <group position={position} rotation={[0, 0, rotation]}>
    <mesh castShadow><boxGeometry args={[0.4, 0.52, 0.008]} /><meshStandardMaterial color="#c3bd9e" roughness={1} /></mesh>
    {space ? <group position={[0, 0.035, 0.008]}>
      <mesh><planeGeometry args={[0.33, 0.34]} /><meshStandardMaterial color="#142332" /></mesh>
      <mesh position={[0, 0, 0.004]}><sphereGeometry args={[0.095, 24, 16]} /><meshStandardMaterial color="#71818d" roughness={1} /></mesh>
      <mesh position={[0.025, 0, 0.01]} rotation={[0.4, 0.15, -0.3]}><ringGeometry args={[0.12, 0.128, 40]} /><meshStandardMaterial color="#a5a38c" side={THREE.DoubleSide} /></mesh>
    </group> : Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[-0.02, 0.16 - i * 0.042, 0.006]}>
      <planeGeometry args={[i % 3 === 0 ? 0.24 : 0.31, i === 0 ? 0.015 : 0.005]} /><meshStandardMaterial color="#6c705f" />
    </mesh>)}
    <mesh position={[0, 0.258, 0.012]}><boxGeometry args={[0.13, 0.04, 0.004]} /><meshStandardMaterial color="#a39c76" transparent opacity={0.7} /></mesh>
  </group>;
}

export function NightStudy({ onOpen, onHover, enabled, weather, reducedMotion }: { onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean; weather: NightWeather; reducedMotion: boolean }) {
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
    {[WINDOW_OPENING.left, windowX, WINDOW_OPENING.right].map((x) => <mesh key={x} position={[x, windowY, -1.82]} castShadow><boxGeometry args={[0.085, windowHeight + 0.12, 0.22]} /><meshStandardMaterial color="#797465" roughness={0.72} /></mesh>)}
    {[WINDOW_OPENING.bottom, 2.22, WINDOW_OPENING.top].map((y) => <mesh key={y} position={[windowX, y, -1.82]}><boxGeometry args={[windowWidth + 0.15, 0.08, 0.22]} /><meshStandardMaterial color="#797465" /></mesh>)}
    <mesh position={[windowX, 1.015, -1.68]} castShadow><boxGeometry args={[windowWidth + 0.25, 0.09, 0.46]} /><meshStandardMaterial map={textures.wood} color="#8a7359" /></mesh>
    <mesh position={[windowX, windowY, WINDOW_OPENING.glassZ]}><planeGeometry args={[windowWidth, windowHeight]} /><meshPhysicalMaterial color="#7f99a6" transparent opacity={0.065} roughness={0.16} depthWrite={false} /></mesh>
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
    <group position={[1.55, 0.86, -0.15]} rotation={[0, -0.15, 0]}>
      <RoundedBox args={[0.64, 0.16, 0.49]} position={[0, 0.08, 0]} radius={0.035} smoothness={3} castShadow><meshStandardMaterial color="#6a6b5c" /></RoundedBox>
      <RoundedBox args={[0.74, 0.14, 0.19]} position={[0, 0.23, -0.12]} radius={0.065} smoothness={3} castShadow><meshStandardMaterial color="#444b42" /></RoundedBox>
      {[0, 1, 2, 3].map((row) => [0, 1, 2].map((col) => <mesh key={`${row}-${col}`} position={[-0.12 + col * 0.12, 0.169, -0.01 + row * 0.075]}><boxGeometry args={[0.08, 0.012, 0.05]} /><meshStandardMaterial color="#b4ae94" /></mesh>))}
    </group>
    <RoomModel name="books" position={[1.64, 0.86, -0.76]} height={0.42} />
    </group>
    <RoomModel name="plantSmall1" position={[-2.65, 1.06, -1.68]} height={0.42} />
    <RoomModel name="bookcaseOpen" position={[3.25, 0, -1.52]} height={2.9} finish="wood" wood={textures.wood} />
    <group position={[2.12, 2.36, -1.82]}>
      <mesh castShadow><boxGeometry args={[1.93, 1.36, 0.055]} /><meshStandardMaterial color="#554b38" roughness={1} /></mesh>
      <mesh position={[0, 0, 0.031]}><planeGeometry args={[1.83, 1.26]} /><meshStandardMaterial color="#72654b" roughness={1} /></mesh>
      <WallPaper position={[-0.58, 0.1, 0.045]} rotation={0.08} space />
      <WallPaper position={[-0.1, 0.21, 0.055]} rotation={-0.08} />
      <WallPaper position={[0.5, 0.05, 0.05]} rotation={0.12} space />
      <WallPaper position={[-0.06, -0.28, 0.065]} rotation={0.08} />
    </group>
    <WallPaper position={[1.26, 3.38, -1.8]} rotation={-0.08} space />
    <mesh position={[2.0, 3.33, -1.76]}><boxGeometry args={[1.1, 0.075, 0.3]} /><meshStandardMaterial map={textures.wood} color="#675240" /></mesh>
    <RoomModel name="books" position={[2.0, 3.37, -1.76]} height={0.3} />
  </group>;
}
