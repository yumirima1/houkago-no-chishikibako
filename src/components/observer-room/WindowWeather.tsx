"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { NightWeather } from "@/lib/observer-weather";
import { exteriorStencil } from "./windowStencil";

const DROPS = 40;
const fraction = (index: number, seed: number) => { const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453; return value - Math.floor(value); };

/** Geometry is allocated once. Weather changes only visibility; falling rain runs on the GPU. */
export function WindowWeather({ weather, reducedMotion }: { weather: NightWeather; reducedMotion: boolean }) {
  const rainMaterial = useRef<THREE.ShaderMaterial>(null);
  const elapsed = useRef(0);
  const resources = useMemo(() => {
    const positions = [], speeds = [], offsets = [];
    for (let i = 0; i < 240; i++) {
      const x = -7 + fraction(i, 1) * 12, y = fraction(i, 2) * 6, z = -7 + fraction(i, 3) * 4;
      positions.push(x, y, z, x + 0.015, y, z); offsets.push(0, 0.2);
      const speed = 1.6 + fraction(i, 4) * 1.2; speeds.push(speed, speed);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("speed", new THREE.Float32BufferAttribute(speeds, 1));
    geometry.setAttribute("streakOffset", new THREE.Float32BufferAttribute(offsets, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } }, transparent: true, depthWrite: false, ...exteriorStencil,
      vertexShader: `uniform float time; attribute float speed; attribute float streakOffset; void main() {
        vec3 p = position; p.y = mod(p.y - time * speed, 6.0) + streakOffset;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
      fragmentShader: `void main() { gl_FragColor = vec4(0.49, 0.64, 0.77, 0.29); }`,
    });
    return { geometry, material };
  }, []);
  useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose(); }, [resources]);
  useFrame((_, delta) => {
    if (weather !== "rain" || reducedMotion) return;
    elapsed.current += Math.min(delta, 0.05);
    if (rainMaterial.current) rainMaterial.current.uniforms.time.value = elapsed.current;
  });
  return <group name="rain-at-window" visible={weather === "rain"}>
    <lineSegments geometry={resources.geometry} frustumCulled={false}><primitive object={resources.material} ref={rainMaterial} attach="material" /></lineSegments>
  </group>;
}

/** Condensation belongs to each sash, so its drops travel with the glass. */
export function WindowGlassWeather({ width, height, weather }: { width: number; height: number; weather: NightWeather }) {
  const drops = useRef<THREE.InstancedMesh>(null), tracks = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    for (let i = 0; i < DROPS; i++) {
      const x = -width / 2 + 0.09 + fraction(i, 5) * (width - 0.18);
      const y = -height / 2 + 0.17 + fraction(i, 6) * (height - 0.34);
      object.position.set(x, y, 0.025);
      const size = 0.005 + fraction(i, 7) * 0.008;
      object.scale.set(size * 0.75, size * 1.6, size * 0.45); object.updateMatrix();
      drops.current?.setMatrixAt(i, object.matrix);
      object.position.y -= 0.04; object.scale.set(0.0018, 0.045 + fraction(i, 8) * 0.06, 1); object.updateMatrix();
      tracks.current?.setMatrixAt(i, object.matrix);
    }
    for (const mesh of [drops.current, tracks.current]) if (mesh) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }, [width, height]);
  return <group name="rain-on-glass" visible={weather === "rain"}>
    <instancedMesh ref={drops} args={[undefined, undefined, DROPS]}>
      <sphereGeometry args={[1, 8, 6]} /><meshPhysicalMaterial color="#b2c9d3" transparent opacity={0.55} roughness={0.12} metalness={0.2} clearcoat={1} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={tracks} args={[undefined, undefined, DROPS]}>
      <planeGeometry args={[1, 1]} /><meshBasicMaterial color="#8faab9" transparent opacity={0.2} depthWrite={false} />
    </instancedMesh>
    <mesh position={[0, 0, 0.01]}>
      <planeGeometry args={[width - 0.08, height - 0.08]} />
      <meshBasicMaterial color="#6b8a9d" transparent opacity={0.035} depthWrite={false} />
    </mesh>
  </group>;
}
