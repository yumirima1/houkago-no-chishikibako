"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { STREET_LEVEL } from "./roomLayout";
import { carPosition } from "./roomMotion";
import { exteriorStencil } from "./windowStencil";

function Car({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  const car = useRef<THREE.Group>(null), elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!car.current || reducedMotion) return;
    elapsed.current += Math.min(delta, 0.08);
    car.current.position.x = carPosition(elapsed.current, index);
  });
  return <group name={`street-car-${index}`} ref={car} position={[carPosition(0, index), STREET_LEVEL + 0.16, index % 2 ? -18.6 : -16.4]} rotation={[0, index % 2 ? Math.PI : 0, 0]}>
    <mesh position={[0, 0.13, 0]}><boxGeometry args={[1.34, 0.28, 0.56]} /><meshStandardMaterial {...exteriorStencil} color={["#707f81", "#b4a28b", "#455767", "#8b6555"][index]} roughness={0.5} /></mesh>
    <mesh position={[-0.07, 0.35, 0]}><boxGeometry args={[0.67, 0.23, 0.48]} /><meshStandardMaterial {...exteriorStencil} color="#263841" roughness={0.28} /></mesh>
    {[-0.43, 0.43].flatMap(x => [-0.28, 0.28].map(z => <mesh key={`${x}${z}`} position={[x, 0, z]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.15, 0.15, 0.07, 12]} /><meshStandardMaterial {...exteriorStencil} color="#172027" /></mesh>))}
    {[-0.19, 0.19].map(z => <mesh key={z} position={[0.68, 0.16, z]}><boxGeometry args={[0.015, 0.07, 0.1]} /><meshBasicMaterial {...exteriorStencil} color="#e5d4a3" toneMapped={false} /></mesh>)}
  </group>;
}

export function NightTraffic({ reducedMotion, rainy }: { reducedMotion: boolean; rainy: boolean }) {
  return <group name="second-floor-street">
    <mesh position={[0, STREET_LEVEL - 0.07, -17.5]}><boxGeometry args={[75, 0.14, 5.7]} /><meshStandardMaterial {...exteriorStencil} color="#26313a" roughness={rainy ? 0.32 : 0.88} metalness={rainy ? 0.12 : 0} /></mesh>
    {[-14.55, -20.45].map(z => <mesh key={z} position={[0, STREET_LEVEL + 0.035, z]}><boxGeometry args={[75, 0.07, 0.3]} /><meshStandardMaterial {...exteriorStencil} color="#586063" /></mesh>)}
    {Array.from({ length: 22 }, (_, i) => <mesh key={i} position={[-35 + i * 3.4, STREET_LEVEL + 0.009, -17.5]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.3, 0.055]} /><meshBasicMaterial {...exteriorStencil} color="#9d9c83" /></mesh>)}
    {[0, 1, 2, 3].map(index => <Car key={index} index={index} reducedMotion={reducedMotion} />)}
  </group>;
}
