"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { STREET_LEVEL } from "./roomLayout";
import { carPosition } from "./roomMotion";
import { exteriorStencil } from "./windowStencil";

function Car({ index, reducedMotion, glow }: { index: number; reducedMotion: boolean; glow: THREE.Texture }) {
  const car = useRef<THREE.Group>(null), elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!car.current || reducedMotion) return;
    elapsed.current += Math.min(delta, 0.08);
    car.current.position.x = carPosition(elapsed.current, index);
  });
  return <group name={`street-car-${index}`} ref={car} position={[carPosition(0, index), STREET_LEVEL + 0.16, index % 2 ? -1.05 : 1.05]} rotation={[0, index % 2 ? Math.PI : 0, 0]}>
    <mesh position={[0, 0.13, 0]}><boxGeometry args={[1.34, 0.28, 0.56]} /><meshStandardMaterial {...exteriorStencil} color={["#707f81", "#b4a28b", "#455767", "#8b6555"][index]} roughness={0.5} /></mesh>
    <mesh position={[-0.07, 0.35, 0]}><boxGeometry args={[0.67, 0.23, 0.48]} /><meshStandardMaterial {...exteriorStencil} color="#263841" roughness={0.28} /></mesh>
    {[-0.43, 0.43].flatMap(x => [-0.28, 0.28].map(z => <mesh key={`${x}${z}`} position={[x, 0, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.07, 12]} /><meshStandardMaterial {...exteriorStencil} color="#172027" /></mesh>))}
    {[-0.19, 0.19].map(z => <mesh key={z} position={[0.68, 0.16, z]}><boxGeometry args={[0.015, 0.07, 0.1]} /><meshBasicMaterial {...exteriorStencil} color="#e5d4a3" toneMapped={false} /></mesh>)}
    {[-0.19, 0.19].map(z => <mesh key={z} position={[-0.68, 0.16, z]}><boxGeometry args={[0.015, 0.07, 0.1]} /><meshBasicMaterial {...exteriorStencil} color="#b9513c" toneMapped={false} /></mesh>)}
    <mesh name={`car-headlight-reflection-${index}`} position={[1.7, -0.145, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3.6, 0.8]} /><meshBasicMaterial {...exteriorStencil} map={glow} color="#d5d8ba" transparent opacity={0.45} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

export function NightTraffic({ reducedMotion, rainy }: { reducedMotion: boolean; rainy: boolean }) {
  const glow = useMemo(() => {
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.max(0, 1 - Math.hypot((x - 15.5) / 16, (y - 15.5) / 16)) ** 2 * 255;
    }
    const texture = new THREE.DataTexture(pixels, 32, 32); texture.needsUpdate = true; return texture;
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);
  return <group name="second-floor-street">
    <mesh position={[0, STREET_LEVEL - 0.07, 0]}><boxGeometry args={[90, 0.14, 5.7]} /><meshStandardMaterial {...exteriorStencil} color="#26313a" roughness={rainy ? 0.32 : 0.65} metalness={0.12} /></mesh>
    {[-2.95, 2.95].map(z => <mesh key={z} position={[0, STREET_LEVEL + 0.035, z]}><boxGeometry args={[90, 0.07, 0.3]} /><meshStandardMaterial {...exteriorStencil} color="#586063" /></mesh>)}
    {Array.from({ length: 26 }, (_, i) => <mesh key={i} position={[-43 + i * 3.4, STREET_LEVEL + 0.009, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.3, 0.055]} /><meshBasicMaterial {...exteriorStencil} color="#9d9c83" /></mesh>)}
    {[-24, -12, 0, 12, 24].map(x => <group key={x} position={[x, STREET_LEVEL, 2.9]}>
      <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.035, 0.05, 2.2, 8]} /><meshStandardMaterial {...exteriorStencil} color="#344653" /></mesh>
      <mesh position={[0, 2.2, 0]}><boxGeometry args={[0.28, 0.08, 0.12]} /><meshBasicMaterial {...exteriorStencil} color="#ddbf83" toneMapped={false} /></mesh>
      <mesh position={[0, 0.015, -0.9]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.9, 3.5]} /><meshBasicMaterial {...exteriorStencil} map={glow} color="#b9a67e" transparent opacity={rainy ? 0.45 : 0.22} depthWrite={false} /></mesh>
    </group>)}
    {[0, 1, 2, 3].map(index => <Car key={index} index={index} reducedMotion={reducedMotion} glow={glow} />)}
  </group>;
}
