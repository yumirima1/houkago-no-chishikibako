"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomModel } from "./RoomAssets";
import { RetroMonitor } from "./RetroMonitor";
import { createWoodTexture, createPlasterTexture } from "./proceduralTextures";
import { ROOM_SIZE, WINDOW_OPENING, WINDOW_FRAME, WINDOW_WALL, WORKSTATION_X, WORKSTATION_Z } from "./roomLayout";
import { WindowWeather } from "./WindowWeather";
import type { NightWeather } from "@/lib/observer-weather";
import { NightWindow } from "./NightWindow";
import { DeskLamp, RoomFurnishings } from "./RoomFurnishings";
import { EPaperPosters } from "./EPaperPosters";

export function NightStudy({ onOpen, onHover, enabled, weather, reducedMotion, windowOpen, onWindowToggle, onWindowSettled }: { onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean; weather: NightWeather; reducedMotion: boolean; windowOpen: boolean; onWindowToggle: () => void; onWindowSettled: () => void }) {
  const textures = useMemo(() => {
    const floor = createWoodTexture("#806248", "#3b3025"); floor.repeat.set(3, 4);
    return { wood: createWoodTexture("#57412d", "#201b17"), plaster: createPlasterTexture(), floor };
  }, []);
  useEffect(() => () => { textures.wood.dispose(); textures.plaster.dispose(); textures.floor.dispose(); }, [textures]);
  const wall = <meshStandardMaterial color="#555650" roughness={0.98} bumpMap={textures.plaster} bumpScale={0.04} />;
  const windowWidth = WINDOW_OPENING.right - WINDOW_OPENING.left;
  const windowHeight = WINDOW_OPENING.top - WINDOW_OPENING.bottom;
  const windowX = (WINDOW_OPENING.left + WINDOW_OPENING.right) / 2;
  const windowY = (WINDOW_OPENING.top + WINDOW_OPENING.bottom) / 2;
  const openComputer = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (enabled && event.delta < 6) onOpen(); };
  return <group name="night-study">
    <mesh name="solid-front-wall" position={[0, 1.75, -2]} receiveShadow><boxGeometry args={[7.6, 3.5, 0.18]} />{wall}</mesh>
    {/* Opening, surround and both sliding panes use the same right-wall frame. */}
    <group name="right-wall-window" position={[...WINDOW_FRAME.position]} rotation={[...WINDOW_FRAME.rotation]}>
    <mesh position={[(WINDOW_WALL.right + WINDOW_OPENING.right) / 2, 1.75, -2]} receiveShadow><boxGeometry args={[WINDOW_WALL.right - WINDOW_OPENING.right, 3.5, 0.18]} />{wall}</mesh>
    <mesh position={[(WINDOW_WALL.left + WINDOW_OPENING.left) / 2, 1.75, -2]} receiveShadow><boxGeometry args={[WINDOW_OPENING.left - WINDOW_WALL.left, 3.5, 0.18]} />{wall}</mesh>
    <mesh position={[windowX, WINDOW_OPENING.bottom / 2, -2]} receiveShadow><boxGeometry args={[windowWidth, WINDOW_OPENING.bottom, 0.18]} />{wall}</mesh>
    <mesh position={[windowX, (ROOM_SIZE.height + WINDOW_OPENING.top) / 2, -2]} receiveShadow><boxGeometry args={[windowWidth, ROOM_SIZE.height - WINDOW_OPENING.top, 0.18]} />{wall}</mesh>
    </group>
    <mesh position={[-3.8, 1.75, 0.7]} receiveShadow><boxGeometry args={[0.18, 3.5, 5.4]} />{wall}</mesh>
    {/* Enclose the observer at seated eye height inside the room. */}
    <mesh position={[0, 3.58, 0.7]} receiveShadow><boxGeometry args={[7.6, 0.16, 5.4]} />{wall}</mesh>
    <mesh position={[0, 3.51, -2]}><boxGeometry args={[7.78, 0.07, 0.23]} /><meshStandardMaterial color="#30332f" /></mesh>
    <mesh position={[-3.8, 3.51, 0.7]}><boxGeometry args={[0.23, 0.07, 5.4]} /><meshStandardMaterial color="#30332f" /></mesh>
    <mesh position={[0, -0.08, 0.7]} receiveShadow><boxGeometry args={[7.6, 0.16, 5.4]} /><meshStandardMaterial map={textures.floor} color="#9a8973" roughness={0.85} /></mesh>
    <mesh position={[0, 0.055, -1.89]}><boxGeometry args={[7.55, 0.11, 0.035]} /><meshStandardMaterial color="#36362e" /></mesh>
    <mesh position={[-3.69, 0.055, 0.7]}><boxGeometry args={[0.035, 0.11, 5.2]} /><meshStandardMaterial color="#36362e" /></mesh>
    <group name="right-window-assembly" position={[...WINDOW_FRAME.position]} rotation={[...WINDOW_FRAME.rotation]}>
    {[WINDOW_OPENING.left, WINDOW_OPENING.right].map((x) => <mesh key={x} position={[x, windowY, -1.82]} castShadow><boxGeometry args={[0.085, windowHeight + 0.12, 0.22]} /><meshStandardMaterial color="#797465" roughness={0.72} /></mesh>)}
    {[WINDOW_OPENING.bottom, WINDOW_OPENING.top].map((y) => <mesh key={y} position={[windowX, y, -1.82]}><boxGeometry args={[windowWidth + 0.15, 0.08, 0.22]} /><meshStandardMaterial color="#797465" /></mesh>)}
    <mesh position={[windowX, WINDOW_OPENING.bottom - 0.035, -1.68]} castShadow><boxGeometry args={[windowWidth + 0.25, 0.09, 0.46]} /><meshStandardMaterial map={textures.wood} color="#8a7359" /></mesh>
    <group name="upper-window-blinds">
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[windowX, WINDOW_OPENING.top - 0.08 - i * 0.085, -1.68]} rotation={[0.18, 0, 0]} castShadow><boxGeometry args={[windowWidth - 0.08, 0.045, 0.11]} /><meshStandardMaterial color="#1d292e" metalness={0.3} roughness={0.6} /></mesh>)}
    </group>
    <NightWindow open={windowOpen} onToggle={onWindowToggle} onSettled={onWindowSettled} onHover={onHover} enabled={enabled} reducedMotion={reducedMotion} weather={weather} />
    <WindowWeather weather={weather} reducedMotion={reducedMotion} />
    <RoomModel name="plantSmall1" position={[-2.65, WINDOW_OPENING.bottom + 0.01, -1.68]} height={0.42} />
    </group>
    <group name="concrete-panel-joints">
      {[1.08, 2.65].map(x => <mesh key={x} position={[x, 1.75, -1.902]}><boxGeometry args={[0.009, 3.4, 0.008]} /><meshStandardMaterial color="#2b302f" /></mesh>)}
      {[0.7, 2.9].map(y => <mesh key={y} position={[2.4, y, -1.902]}><boxGeometry args={[2.7, 0.009, 0.008]} /><meshStandardMaterial color="#2b302f" /></mesh>)}
      {[1.2, 2.53, 3.55].flatMap(x => [0.83, 2.76, 3.3].map(y => <mesh key={`${x}${y}`} position={[x, y, -1.898]}><circleGeometry args={[0.018, 12]} /><meshStandardMaterial color="#292e2d" /></mesh>))}
    </group>
    <group position={[WORKSTATION_X, 0, WORKSTATION_Z]}>
    <RoomModel name="desk" position={[0, 0, -0.22]} size={[4.5, 0.86, 1.65]} finish="wood" wood={textures.wood} />
    <RetroMonitor onOpen={onOpen} onHover={onHover} enabled={enabled} />
    <group name="interactive-keyboard-mouse" onClick={openComputer} onPointerOver={(event) => { event.stopPropagation(); if (enabled) onHover(true); }} onPointerOut={() => onHover(false)}>
    <RoomModel name="computerKeyboard" position={[0.21, 0.86, 0.56]} size={[1.15, 0.1, 0.39]} finish="cream" />
    {Array.from({ length: 5 }, (_, row) => Array.from({ length: 13 }, (_, col) => <mesh key={`${row}-${col}`} position={[-0.3 + col * 0.076, 0.955 + (4 - row) * 0.003, 0.415 + row * 0.06]} castShadow>
      <boxGeometry args={[0.065, 0.017, 0.047]} /><meshStandardMaterial color={col % 6 === 0 ? "#938e7c" : "#c1b99e"} roughness={0.7} />
    </mesh>))}
    <RoomModel name="computerMouse" position={[1.03, 0.86, 0.52]} height={0.085} finish="cream" />
    <mesh position={[1.03, 0.868, 0.52]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[0.72, 0.65]} /><meshStandardMaterial color="#142321" roughness={0.95} /></mesh>
    </group>
    <DeskLamp />
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
    <group name="corner-bookshelf" position={[-3.28, 0, -0.85]} rotation={[0, Math.PI / 2, 0]}>
      <RoomModel name="bookcaseOpen" height={2.5} finish="wood" wood={textures.wood} />
      {[0.37, 1.052, 1.734, 2.416].map((height, i) => <RoomModel key={height} name="books" position={[i % 2 ? 0.1 : -0.08, height, 0.02]} height={0.27} />)}
    </group>
    <EPaperPosters />
    <RoomFurnishings onOpen={onOpen} onHover={onHover} enabled={enabled} />
  </group>;
}
