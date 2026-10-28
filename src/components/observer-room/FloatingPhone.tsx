"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { phoneProgress } from "./roomMotion";

export type TerminalPhase = "room" | "opening" | "desktop" | "closing";

export function FloatingPhone({ phase, reducedMotion, onOpen }: { phase: TerminalPhase; reducedMotion: boolean; onOpen: () => void }) {
  const phone = useRef<THREE.Group>(null), started = useRef(0);
  const pose = useMemo(() => ({ start: new THREE.Vector3(-1.35, 0.91, 0.15), end: new THREE.Vector3(),
    lifted: new THREE.Vector3(-1.35, 2.35, 0.15), flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.15)) }), []);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 512;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#e6e8d8"; c.fillRect(0, 0, 256, 512);
    c.fillStyle = "#304536"; c.font = "16px sans-serif"; c.fillText("KOUSATSU", 29, 72);
    c.font = "30px serif"; c.fillText("考察箱", 35, 145);
    c.font = "14px sans-serif"; c.fillText("問いを、ひとつずつ。", 30, 182);
    for (let i = 0; i < 3; i++) { c.fillStyle = "#d5dbc7"; c.fillRect(24, 240 + i * 62, 208, 45); }
    c.fillStyle = "#304536"; c.font = "15px sans-serif"; ["考察アーカイブ", "収集ニュース", "システム"].forEach((label, i) => c.fillText(label, 38, 270 + i * 62));
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => { started.current = performance.now(); }, [phase]);
  useFrame(({ camera }) => {
    if (!phone.current) return;
    const progress = phase === "room" ? 0 : phase === "desktop" ? 1 : reducedMotion ? (phase === "opening" ? 1 : 0) : phoneProgress(performance.now() - started.current, phase === "opening");
    pose.end.set(0, 0, -1.08).applyQuaternion(camera.quaternion).add(camera.position);
    // The camera stays in the room pose; the phone travels up and towards it.
    const lift = Math.min(1, progress * 2.5);
    phone.current.position.lerpVectors(pose.start, pose.lifted, lift);
    phone.current.position.lerp(pose.end, progress);
    phone.current.quaternion.copy(pose.flat).slerp(camera.quaternion, progress);
  });
  return <group ref={phone} name="floating-phone" onClick={event => { event.stopPropagation(); if (phase === "room" && event.delta < 6) onOpen(); }}>
    <RoundedBox args={[0.34, 0.68, 0.045]} radius={0.035} smoothness={3} castShadow><meshStandardMaterial color="#1e2423" metalness={0.35} roughness={0.38} /></RoundedBox>
    <RoundedBox args={[0.305, 0.616, 0.006]} position={[0, 0, 0.025]} radius={0.022} smoothness={3}><meshStandardMaterial color="#18211d" roughness={0.3} /></RoundedBox>
    {/* A planar screen keeps the full portrait canvas visible, without rounded-box UV cropping. */}
    <mesh position={[0, 0, 0.0286]}><planeGeometry args={[0.286, 0.572]} /><meshBasicMaterial map={texture} toneMapped={false} /></mesh>
    <mesh position={[0, 0.297, 0.03]}><boxGeometry args={[0.085, 0.013, 0.004]} /><meshStandardMaterial color="#111816" /></mesh>
    <mesh position={[0, -0.295, 0.03]}><boxGeometry args={[0.08, 0.004, 0.004]} /><meshBasicMaterial color="#7f9385" /></mesh>
  </group>;
}
