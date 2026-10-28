"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { RetroMonitor } from "./RetroMonitor";
import { createFabricTexture } from "./proceduralTextures";

function Box({ position, size, color = "#242728" }: { position: [number, number, number]; size: [number, number, number]; color?: string }) {
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.86} /></mesh>;
}

export function RoomFurnishings({ onOpen, onHover, enabled }: { onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean }) {
  const fabric = useMemo(() => createFabricTexture("#434b4a"), []);
  useEffect(() => () => fabric.dispose(), [fabric]);
  return <group name="room-furnishings">
    <group name="office-chair" position={[-0.25, 0, 1.05]} rotation={[0, -0.12, 0]}>
      <mesh position={[0, 0.29, 0]}><cylinderGeometry args={[0.045, 0.055, 0.5, 16]} /><meshStandardMaterial color="#626566" metalness={0.7} roughness={0.4} /></mesh>
      {[0, 1, 2, 3, 4].map(i => <group key={i} rotation={[0, i * Math.PI * 2 / 5, 0]}><Box position={[0, 0.09, 0.22]} size={[0.055, 0.05, 0.48]} /><mesh position={[0, 0.055, 0.43]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.055, 0.055, 0.055, 12]} /><meshStandardMaterial color="#181b1c" /></mesh></group>)}
      <RoundedBox position={[0, 0.59, 0]} args={[0.66, 0.14, 0.6]} radius={0.07} smoothness={3} castShadow><meshStandardMaterial color="#33393a" map={fabric} roughness={1} /></RoundedBox>
      <Box position={[0, 0.85, 0.28]} size={[0.08, 0.6, 0.06]} />
      <RoundedBox position={[0, 1.07, 0.3]} args={[0.63, 0.7, 0.12]} radius={0.06} smoothness={3} castShadow><meshStandardMaterial color="#303637" map={fabric} roughness={1} /></RoundedBox>
      {[-1, 1].map(side => <group key={side}><Box position={[side * 0.36, 0.72, 0]} size={[0.04, 0.25, 0.04]} /><Box position={[side * 0.36, 0.85, -0.03]} size={[0.1, 0.05, 0.4]} /></group>)}
    </group>
    <group name="pc-tower" position={[1.45, 0, -0.65]}>
      <Box position={[0, 0.29, 0]} size={[0.34, 0.58, 0.55]} />
      {Array.from({ length: 8 }, (_, i) => <Box key={i} position={[0, 0.13 + i * 0.025, 0.279]} size={[0.23, 0.008, 0.006]} color="#111516" />)}
      <mesh position={[0.09, 0.5, 0.282]}><circleGeometry args={[0.013, 12]} /><meshBasicMaterial color="#aaa886" /></mesh>
    </group>
    <group name="small-crt" position={[1.24, 0.86, -0.88]} rotation={[0, -0.18, 0]} scale={0.55}>
      <RetroMonitor position={[0, 0, 0]} name="interactive-secondary-crt" onOpen={onOpen} onHover={onHover} enabled={enabled} />
    </group>
  </group>;
}

export function EPaperPosters() {
  return <group name="two-portrait-epaper-posters">
    {[{ x: 1.75, y: 2.23, orbit: false }, { x: 2.58, y: 2.55, orbit: true }].map(({ x, y, orbit }, index) => <group key={x} name={`epaper-poster-${index + 1}`} position={[x, y, -1.88]}>
      <Box position={[0, 0, 0]} size={[0.63, 1.05, 0.035]} color="#242a29" />
      <mesh position={[0, 0, 0.02]}><planeGeometry args={[0.57, 0.99]} /><meshStandardMaterial color="#d2d0bc" roughness={1} /></mesh>
      {orbit ? <group position={[0, 0.09, 0.025]}><mesh><circleGeometry args={[0.15, 40]} /><meshStandardMaterial color="#5d675e" roughness={1} /></mesh><mesh rotation={[0, 0, 0.4]} position={[0, 0, 0.004]} scale={[1, 0.4, 1]}><ringGeometry args={[0.23, 0.239, 48]} /><meshStandardMaterial color="#8b8c78" roughness={1} /></mesh></group> : Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[-0.025, 0.28 - i * 0.055, 0.025]}><planeGeometry args={[i === 0 ? 0.25 : 0.4, i === 0 ? 0.025 : 0.008]} /><meshStandardMaterial color="#737b6a" roughness={1} /></mesh>)}
      <mesh position={[0, -0.37, 0.025]}><planeGeometry args={[0.25, 0.008]} /><meshStandardMaterial color="#8b8c78" roughness={1} /></mesh>
    </group>)}
  </group>;
}
