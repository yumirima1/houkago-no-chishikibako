"use client";

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RetroMonitor } from "./RetroMonitor";
import { createFabricTexture } from "./proceduralTextures";

function Box({ position, size, color = "#242728" }: { position: [number, number, number]; size: [number, number, number]; color?: string }) {
  return <mesh position={position} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.86} /></mesh>;
}

export function DeskLamp() {
  const target = useMemo(() => new THREE.Object3D(), []);
  return <group name="articulated-desk-lamp" position={[-2, 0.86, -0.67]}>
    <mesh position={[0, 0.035, 0]} castShadow><cylinderGeometry args={[0.23, 0.25, 0.07, 24]} /><meshStandardMaterial color="#141b1d" metalness={0.6} roughness={0.35} /></mesh>
    {[[0, 0.36, -0.12, 0.62, -0.22], [0.19, 0.8, -0.12, 0.62, -0.72]].map(([x, y, z, height, angle], i) => <group key={i} position={[x, y, z]} rotation={[0, 0, angle]}>
      {[-0.035, 0.035].map(offset => <mesh key={offset} position={[offset, 0, 0]} castShadow><cylinderGeometry args={[0.018, 0.018, height, 8]} /><meshStandardMaterial color="#182123" metalness={0.65} roughness={0.4} /></mesh>)}
      <mesh position={[0, height / 2, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.048, 0.048, 0.11, 12]} /><meshStandardMaterial color="#292f2e" metalness={0.7} /></mesh>
    </group>)}
    <group position={[0.47, 1.03, -0.12]} rotation={[0, 0, 0.38]}>
      <mesh castShadow><coneGeometry args={[0.25, 0.3, 32, 1, true]} /><meshStandardMaterial color="#101b20" metalness={0.55} roughness={0.3} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.235, 32]} /><meshBasicMaterial color="#ffe2a3" toneMapped={false} side={THREE.DoubleSide} /></mesh>
    </group>
    <primitive object={target} position={[0.55, 0, 0.45]} />
    <spotLight position={[0.47, 0.95, -0.12]} target={target} color="#ffbc72" intensity={16} angle={0.95} penumbra={0.85} distance={5} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.001} />
    <pointLight position={[0.45, 0.92, -0.08]} color="#ffcb82" intensity={2.6} distance={3.5} decay={2} />
  </group>;
}
export function RoomFurnishings({ onOpen, onHover, enabled }: { onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean }) {
  const fabric = useMemo(() => createFabricTexture("#151b1c"), []);
  useEffect(() => () => fabric.dispose(), [fabric]);
  return <group name="room-furnishings">
    <group name="office-chair" position={[-0.7, 0, 1.15]} rotation={[0, -0.12, 0]}>
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
    <group name="small-crt" position={[1.95, 0.86, -0.88]} rotation={[0, -0.18, 0]} scale={0.55}>
      <RetroMonitor position={[0, 0, 0]} name="interactive-secondary-crt" onOpen={onOpen} onHover={onHover} enabled={enabled} />
    </group>
  </group>;
}
