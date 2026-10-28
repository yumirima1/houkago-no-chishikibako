"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomModel } from "./RoomAssets";
import { trainPosition } from "./roomMotion";
import type { NightWeather } from "@/lib/observer-weather";
import { WINDOW_OPENING, STREET_LEVEL, VIADUCT_LEVEL, TRAFFIC_Z, TRAFFIC_ANGLE } from "./roomLayout";
import { exteriorStencil } from "./windowStencil";
import { NightTraffic } from "./NightTraffic";

const BLOCKS: [string, number, number, number][] = [
  ["low-detail-building-a", -14, -40, 10], ["building-skyscraper-b", -8, -45, 15],
  ["low-detail-building-d", -2, -42, 9], ["building-skyscraper-e", 5, -48, 17],
  ["building-skyscraper-b", 13, -42, 12], ["building-c", -12, -34, 5],
  ["building-f", -5.5, -37, 7], ["building-c", 2, -35, 5.5], ["building-f", 10, -38, 7.5],
];

function Train({ reducedMotion }: { reducedMotion: boolean }) {
  const train = useRef<THREE.Group>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!train.current || reducedMotion) return;
    elapsed.current += Math.min(delta, 0.05);
    train.current.position.x = trainPosition(elapsed.current);
  });
  return <group ref={train} position={[trainPosition(0), VIADUCT_LEVEL + 0.42, 0]} name="night-train">
    {[0, 1, 2, 3].map((car) => <group key={car} position={[-car * 2.65, 0, 0]}>
      <mesh><boxGeometry args={[2.5, 0.64, 0.82]} /><meshStandardMaterial {...exteriorStencil} color="#819195" roughness={0.55} /></mesh>
      <mesh position={[0, -0.12, 0.415]}><boxGeometry args={[2.49, 0.065, 0.009]} /><meshStandardMaterial {...exteriorStencil} color="#688f86" /></mesh>
      {[0, 1, 2, 3, 4].map((window) => <mesh key={window} position={[-0.96 + window * 0.48, 0.1, 0.417]}>
        <planeGeometry args={[0.31, 0.23]} /><meshBasicMaterial {...exteriorStencil} color={window % 3 === 0 ? "#8eabaf" : "#e3c88b"} toneMapped={false} />
      </mesh>)}
    </group>)}
    <mesh position={[1.26, 0, 0.28]}><sphereGeometry args={[0.055, 8, 8]} /><meshBasicMaterial {...exteriorStencil} color="#fff1c6" /></mesh>
  </group>;
}

function CityWindows({ rainy }: { rainy: boolean }) {
  const instances = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const glow = useMemo(() => {
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.max(0, 1 - radius) ** 2 * 255;
    }
    const texture = new THREE.DataTexture(pixels, size, size); texture.needsUpdate = true; return texture;
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);
  const windows = useMemo(() => BLOCKS.flatMap(([, x, z, height], index) =>
    Array.from({ length: Math.floor(height / 0.8) }, (_, floor) => [0, 1, 2].map((column) => ({
      visible: (floor + column + index) % 4 !== 0,
      position: [x - 0.65 + column * 0.65, -3.25 + floor * 0.73, z + (height > 11 ? 1.5 : 1.75) + 0.025] as [number, number, number],
      color: (floor + column) % 3 ? "#a69870" : "#556c85",
    }))).flat().filter((window) => window.visible)), []);
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    windows.forEach((window, index) => {
      object.position.set(...window.position); object.updateMatrix();
      instances.current?.setMatrixAt(index, object.matrix);
      instances.current?.setColorAt(index, new THREE.Color(window.color));
      halos.current?.setMatrixAt(index, object.matrix);
      halos.current?.setColorAt(index, new THREE.Color(window.color));
    });
    if (instances.current) {
      instances.current.instanceMatrix.needsUpdate = true;
      if (instances.current.instanceColor) instances.current.instanceColor.needsUpdate = true;
      instances.current.computeBoundingSphere();
    }
    if (halos.current) {
      halos.current.instanceMatrix.needsUpdate = true;
      if (halos.current.instanceColor) halos.current.instanceColor.needsUpdate = true;
      halos.current.computeBoundingSphere();
    }
  }, [windows]);
  return <group><instancedMesh ref={instances} args={[undefined, undefined, windows.length]}>
    <planeGeometry args={[0.22, 0.18]} /><meshBasicMaterial {...exteriorStencil} toneMapped={false} />
  </instancedMesh><instancedMesh ref={halos} args={[undefined, undefined, windows.length]} visible={rainy}>
    <planeGeometry args={[1.1, 0.85]} /><meshBasicMaterial {...exteriorStencil} map={glow} transparent opacity={0.38} depthWrite={false} toneMapped={false} />
  </instancedMesh></group>;
}

export function NightCity({ reducedMotion, weather }: { reducedMotion: boolean; weather: NightWeather }) {
  const beacon = useRef<THREE.MeshBasicMaterial>(null);
  const litWindows = useRef<THREE.MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (reducedMotion) return;
    elapsed.current += Math.min(delta, 0.05);
    if (beacon.current) beacon.current.opacity = 0.35 + Math.pow((Math.sin(elapsed.current * 1.25) + 1) / 2, 7) * 0.65;
    if (litWindows.current) litWindows.current.color.setRGB(0.56 + Math.sin(elapsed.current * 0.17) * 0.06, 0.52, 0.34);
  });
  return <group name="exterior-only">
    <mesh name="exterior-window-mask" renderOrder={-100} position={[(WINDOW_OPENING.left + WINDOW_OPENING.right) / 2, (WINDOW_OPENING.top + WINDOW_OPENING.bottom) / 2, -1.95]}>
      <planeGeometry args={[WINDOW_OPENING.right - WINDOW_OPENING.left, WINDOW_OPENING.top - WINDOW_OPENING.bottom]} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} depthTest={false} stencilWrite stencilRef={1} stencilFunc={THREE.AlwaysStencilFunc} stencilZPass={THREE.ReplaceStencilOp} />
    </mesh>
    <mesh position={[0, 3, -78]}><planeGeometry args={[150, 90]} /><meshBasicMaterial {...exteriorStencil} color={weather === "rain" ? "#0b1626" : "#101e30"} /></mesh>
    <mesh position={[-19, 8, -70]} visible={weather === "clear"}><circleGeometry args={[0.62, 32]} /><meshBasicMaterial {...exteriorStencil} color="#7d8c9b" /></mesh>
    {BLOCKS.map(([name, x, z, height], index) => <RoomModel key={index} position={[x, -3.8, z]} name={name} kind="city"
      size={[height > 11 ? 3 : 3.8, height, height > 11 ? 3 : 3.5]} finish="city" />)}
    <CityWindows rainy={weather === "rain"} />
    <mesh position={[-14, 6.28, -23]}><sphereGeometry args={[0.075, 8, 8]} /><meshBasicMaterial {...exteriorStencil} ref={beacon} color="#c78069" transparent /></mesh>
    <mesh position={[-10, 0.5, -11.225]}><planeGeometry args={[1.8, 0.14]} /><meshBasicMaterial {...exteriorStencil} ref={litWindows} color="#b3a079" /></mesh>
    <group name="diagonal-viaduct-corridor" position={[0, 0, TRAFFIC_Z]} rotation={[0, TRAFFIC_ANGLE, 0]}>
      <NightTraffic reducedMotion={reducedMotion} rainy={weather === "rain"} />
      <group name="elevated-railway" position={[0, VIADUCT_LEVEL, 0]}>
        <mesh name="viaduct-deck" position={[0, -0.18, 0]}><boxGeometry args={[90, 0.36, 3.5]} /><meshStandardMaterial {...exteriorStencil} color="#364958" /></mesh>
        {[-0.5, 0.5].map(z => <mesh key={z} position={[0, 0.035, z]}><boxGeometry args={[90, 0.055, 0.06]} /><meshStandardMaterial {...exteriorStencil} color="#89939b" metalness={0.6} /></mesh>)}
        {[-1.7, 1.7].map(z => <mesh key={z} position={[0, 0.15, z]}><boxGeometry args={[90, 0.3, 0.08]} /><meshStandardMaterial {...exteriorStencil} color="#5a6a78" /></mesh>)}
        {[-32, -24, -16, -8, 0, 8, 16, 24, 32].map(x => <group key={x} position={[x, 0, 0]}>
          {[-2.2, 2.2].map(z => <mesh key={z} position={[0, (STREET_LEVEL - VIADUCT_LEVEL - 0.36) / 2, z]}><boxGeometry args={[0.5, VIADUCT_LEVEL - STREET_LEVEL - 0.36, 0.5]} /><meshStandardMaterial {...exteriorStencil} color="#40505b" /></mesh>)}
          <mesh position={[0, -0.46, 0]}><boxGeometry args={[0.7, 0.2, 5]} /><meshStandardMaterial {...exteriorStencil} color="#40505b" /></mesh>
        </group>)}
      </group>
      <Train reducedMotion={reducedMotion} />
    </group>
  </group>;
}
