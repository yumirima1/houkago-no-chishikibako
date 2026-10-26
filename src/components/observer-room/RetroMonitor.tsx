"use client";

import { RoundedBox } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomModel } from "./RoomAssets";
import { createCRTBezelGeometry } from "./crtGeometry";

function screenResources() {
  const canvas = document.createElement("canvas");
  canvas.width = 768; canvas.height = 480;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#234c4c"; context.fillRect(0, 0, 768, 480);
  context.fillStyle = "#c0c4ac"; context.fillRect(0, 0, 768, 30);
  context.fillStyle = "#293c38"; context.font = "bold 17px monospace";
  context.fillText("KOUSATSU     File   View   Special", 18, 21);
  ["ARCHIVE", "NEWS", "SYSTEM"].forEach((label, index) => {
    const y = 94 + index * 102;
    context.fillStyle = "#d1caa3"; context.fillRect(48, y, 42, 29); context.fillRect(48, y - 6, 21, 8);
    context.fillStyle = "#d9dfcc"; context.font = "16px monospace"; context.fillText(label, 34, y + 53);
  });
  context.strokeStyle = "#77a49a"; context.strokeRect(252, 104, 418, 236);
  context.fillStyle = "#acbca7"; context.font = "14px monospace"; context.fillText("THE OBSERVER'S ARCHIVE", 278, 135);
  context.fillStyle = "#ced7bc"; context.font = "38px serif"; context.fillText("考 察 箱", 326, 223);
  context.fillStyle = "#88aca1"; context.font = "13px monospace"; context.fillText("A quiet place for questions.", 290, 285);
  context.fillStyle = "#bec4b0"; context.fillRect(0, 451, 768, 29);
  context.fillStyle = "#344840"; context.font = "16px monospace"; context.fillText("クリックして起動 / Open desktop", 18, 472);
  for (let y = 0; y < 480; y += 3) { context.fillStyle = "rgba(3,14,13,0.16)"; context.fillRect(0, y, 768, 1); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const w = 0.62, h = 0.36, r = 0.07;
  // A segmented plane gives the glass actual curvature, including its interior.
  const plane = new THREE.PlaneGeometry(w * 2, h * 2, 32, 24);
  const positions = plane.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i), y = positions.getY(i);
    if (Math.abs(x) > w - r && Math.abs(y) > h - r) {
      const dx = Math.abs(x) - (w - r), dy = Math.abs(y) - (h - r);
      const scale = Math.min(1, r / Math.hypot(dx, dy));
      x = Math.sign(x) * (w - r + dx * scale); y = Math.sign(y) * (h - r + dy * scale);
    }
    positions.setXYZ(i, x, y, 0.032 * (1 - (x / w) ** 2) * (1 - (y / h) ** 2));
  }
  plane.computeVertexNormals();
  return { geometry: plane, texture, bezel: createCRTBezelGeometry() };
}

export function RetroMonitor({ onOpen, onHover, enabled }: { onOpen: () => void; onHover: (hover: boolean) => void; enabled: boolean }) {
  const resources = useMemo(() => screenResources(), []);
  useEffect(() => () => { resources.geometry.dispose(); resources.texture.dispose(); resources.bezel.dispose(); }, [resources]);
  const open = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (enabled && event.delta < 6) onOpen();
  };
  return <group position={[0.12, 0.86, -0.48]} onClick={open}
    onPointerOver={(event) => { event.stopPropagation(); if (enabled) onHover(true); }} onPointerOut={() => onHover(false)} name="interactive-crt">
    <RoundedBox args={[0.88, 0.075, 0.66]} position={[0, 0.04, 0.03]} radius={0.035} smoothness={3} castShadow><meshStandardMaterial color="#a79e86" roughness={0.7} /></RoundedBox>
    <mesh position={[0, 0.13, 0]}><cylinderGeometry args={[0.22, 0.3, 0.15, 24]} /><meshStandardMaterial color="#b6aa8e" /></mesh>
    <RoomModel name="televisionVintage" position={[0, 0.2, 0]} size={[1.54, 1.02, 1.03]} finish="crt" rearCut={0.27} />
    <mesh geometry={resources.bezel} position={[0, 0.71, 0]} castShadow receiveShadow><meshStandardMaterial color="#c3b69b" roughness={0.65} /></mesh>
    <RoundedBox args={[1.3, 0.78, 0.045]} position={[0, 0.71, 0.455]} radius={0.07} smoothness={4}><meshStandardMaterial color="#28332e" roughness={0.65} /></RoundedBox>
    <mesh geometry={resources.geometry} position={[0, 0.71, 0.49]}>
      <meshPhysicalMaterial map={resources.texture} emissiveMap={resources.texture} emissive="#b4d9c8" emissiveIntensity={0.65}
        roughness={0.3} clearcoat={0.6} clearcoatRoughness={0.3} metalness={0} />
    </mesh>
    {/* Side ventilation and the deeper original housing remain visible. */}
    {Array.from({ length: 11 }, (_, index) => <mesh key={index} position={[0.774, 0.54 + index * 0.043, -0.12]}>
      <boxGeometry args={[0.006, 0.012, 0.48]} /><meshStandardMaterial color="#666555" roughness={1} />
    </mesh>)}
    <mesh position={[0.53, 0.29, 0.52]}><sphereGeometry args={[0.014, 10, 8]} /><meshBasicMaterial color="#a2c27d" /></mesh>
    <mesh position={[-0.49, 0.29, 0.521]}><planeGeometry args={[0.18, 0.025]} /><meshStandardMaterial color="#697568" metalness={0.6} roughness={0.35} /></mesh>
    <pointLight position={[0, 0.7, 0.8]} color="#87bfb0" intensity={0.5} distance={2.2} />
  </group>;
}
