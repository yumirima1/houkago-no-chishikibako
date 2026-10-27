"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomModel } from "./RoomAssets";
import { createFabricTexture } from "./proceduralTextures";

function Box({ position, size, color = "#242728", wood }: { position: [number, number, number]; size: [number, number, number]; color?: string; wood?: THREE.Texture }) {
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} map={wood} roughness={0.86} /></mesh>;
}

export function RoomFurnishings({ wood, onOpen, onHover, enabled }: { wood: THREE.Texture; onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean }) {
  const fabric = useMemo(() => createFabricTexture("#434b4a"), []);
  useEffect(() => () => fabric.dispose(), [fabric]);
  return <group name="room-furnishings">
    <group name="bed" position={[-3.3, 0, 1.05]}>
      <Box position={[0, 0.26, 0]} size={[1.25, 0.16, 2.1]} color="#6a4e36" wood={wood} />
      {[-0.52, 0.52].flatMap(x => [-0.9, 0.9].map(z => <Box key={`${x}${z}`} position={[x, 0.12, z]} size={[0.1, 0.24, 0.1]} />))}
      <Box position={[0, 0.58, -1.06]} size={[1.3, 0.95, 0.08]} color="#5a402c" wood={wood} />
      <RoundedBox position={[0, 0.44, 0]} args={[1.18, 0.22, 2]} radius={0.06} smoothness={3} castShadow><meshStandardMaterial color="#c7c3b3" roughness={1} /></RoundedBox>
      <RoundedBox position={[0, 0.57, -0.7]} args={[0.78, 0.15, 0.4]} radius={0.07} smoothness={3} castShadow><meshStandardMaterial color="#d5d0bd" roughness={1} /></RoundedBox>
      <Box position={[0, 0.56, -0.35]} size={[1.17, 0.035, 0.18]} color="#b8b4a4" />
      <mesh position={[0, 0.565, 0.32]} castShadow><boxGeometry args={[1.19, 0.045, 1.25]} /><meshStandardMaterial color="#626c68" map={fabric} roughness={1} /></mesh>
    </group>
    <group name="office-chair" position={[0.25, 0, 1.1]} rotation={[0, -0.18, 0]}>
      <mesh position={[0, 0.29, 0]}><cylinderGeometry args={[0.045, 0.055, 0.5, 16]} /><meshStandardMaterial color="#626566" metalness={0.7} roughness={0.4} /></mesh>
      {[0, 1, 2, 3, 4].map(i => <group key={i} rotation={[0, i * Math.PI * 2 / 5, 0]}><Box position={[0, 0.09, 0.22]} size={[0.055, 0.05, 0.48]} /><mesh position={[0, 0.055, 0.43]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.055, 0.055, 0.055, 12]} /><meshStandardMaterial color="#181b1c" /></mesh></group>)}
      <RoundedBox position={[0, 0.59, 0]} args={[0.66, 0.14, 0.6]} radius={0.07} smoothness={3} castShadow><meshStandardMaterial color="#33393a" map={fabric} roughness={1} /></RoundedBox>
      <Box position={[0, 0.85, 0.28]} size={[0.08, 0.6, 0.06]} />
      <RoundedBox position={[0, 1.07, 0.3]} args={[0.63, 0.7, 0.12]} radius={0.06} smoothness={3} castShadow><meshStandardMaterial color="#303637" map={fabric} roughness={1} /></RoundedBox>
      {[-1, 1].map(side => <group key={side}><Box position={[side * 0.36, 0.72, 0]} size={[0.04, 0.25, 0.04]} /><Box position={[side * 0.36, 0.85, -0.03]} size={[0.1, 0.05, 0.4]} /></group>)}
    </group>
    <group name="pc-tower" position={[1.8, 0, -0.65]}>
      <Box position={[0, 0.29, 0]} size={[0.34, 0.58, 0.55]} />
      {Array.from({ length: 8 }, (_, i) => <Box key={i} position={[0, 0.13 + i * 0.025, 0.279]} size={[0.23, 0.008, 0.006]} color="#111516" />)}
      <mesh position={[0.09, 0.5, 0.282]}><circleGeometry args={[0.013, 12]} /><meshBasicMaterial color="#aaa886" /></mesh>
    </group>
    <group name="second-monitor" position={[1.48, 0.86, -0.98]} rotation={[0, -0.15, 0]} onClick={event => { event.stopPropagation(); if (enabled && event.delta < 6) onOpen(); }} onPointerOver={event => { event.stopPropagation(); if (enabled) onHover(true); }} onPointerOut={() => onHover(false)}>
      <Box position={[0, 0.025, 0]} size={[0.5, 0.05, 0.34]} />
      <Box position={[0, 0.18, 0]} size={[0.075, 0.32, 0.07]} />
      <RoundedBox position={[0, 0.55, 0]} args={[1.04, 0.67, 0.07]} radius={0.025} smoothness={2} castShadow><meshStandardMaterial color="#202728" /></RoundedBox>
      <mesh position={[0, 0.55, 0.037]}><planeGeometry args={[0.96, 0.59]} /><meshStandardMaterial color="#345153" emissive="#345153" emissiveIntensity={0.25} roughness={0.6} /></mesh>
      {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[-0.09, 0.73 - i * 0.055, 0.04]}><planeGeometry args={[i % 3 === 0 ? 0.55 : 0.7, 0.012]} /><meshBasicMaterial color="#7d9690" /></mesh>)}
    </group>
    <group name="vintage-television" position={[3.25, 0, 1]} rotation={[0, -0.35, 0]}>
      <Box position={[0, 0.38, 0]} size={[1.15, 0.12, 0.85]} color="#62462f" wood={wood} />
      {[-0.48, 0.48].flatMap(x => [-0.32, 0.32].map(z => <Box key={`${x}${z}`} position={[x, 0.16, z]} size={[0.07, 0.32, 0.07]} />))}
      <RoomModel name="televisionVintage" position={[0, 0.44, 0]} size={[0.92, 0.67, 0.68]} />
    </group>
  </group>;
}

export function EPaperPosters() {
  return <group name="two-portrait-epaper-posters">
    {[{ x: 1.55, y: 2.7, orbit: false }, { x: 2.35, y: 2.98, orbit: true }].map(({ x, y, orbit }, index) => <group key={x} name={`epaper-poster-${index + 1}`} position={[x, y, -1.82]}>
      <Box position={[0, 0, 0]} size={[0.63, 1.05, 0.035]} color="#242a29" />
      <mesh position={[0, 0, 0.02]}><planeGeometry args={[0.57, 0.99]} /><meshStandardMaterial color="#d2d0bc" roughness={1} /></mesh>
      {orbit ? <group position={[0, 0.09, 0.025]}><mesh><circleGeometry args={[0.15, 40]} /><meshStandardMaterial color="#5d675e" roughness={1} /></mesh><mesh rotation={[0, 0, 0.4]} position={[0, 0, 0.004]} scale={[1, 0.4, 1]}><ringGeometry args={[0.23, 0.239, 48]} /><meshStandardMaterial color="#8b8c78" roughness={1} /></mesh></group> : Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[-0.025, 0.28 - i * 0.055, 0.025]}><planeGeometry args={[i === 0 ? 0.25 : 0.4, i === 0 ? 0.025 : 0.008]} /><meshStandardMaterial color="#737b6a" roughness={1} /></mesh>)}
      <mesh position={[0, -0.37, 0.025]}><planeGeometry args={[0.25, 0.008]} /><meshStandardMaterial color="#8b8c78" roughness={1} /></mesh>
    </group>)}
  </group>;
}
