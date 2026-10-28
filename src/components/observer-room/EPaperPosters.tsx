"use client";

import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEPaperImages } from "./EPaper";

export function EPaperPosters() {
  const images = useEPaperImages();
  return <group name="two-portrait-epaper-posters">{[{ x: 1.75, y: 2.65 }, { x: 2.58, y: 2.3 }].map(({ x, y }, index) =>
    <group key={x} name={`epaper-poster-${index + 1}`} position={[x, y, -1.88]}>
      <mesh castShadow><boxGeometry args={[0.63, 1.05, 0.035]} /><meshStandardMaterial color="#202624" roughness={0.9} /></mesh>
      <EPaperSurface url={images[index]} index={index} />
    </group>)}</group>;
}

function EPaperSurface({ url, index }: { url: string | null; index: number }) {
  const invalidate = useThree(state => state.invalidate);
  const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    const texture = new THREE.TextureLoader().load(url, result => { if (active) { setLoaded({ url, texture: result }); invalidate(); } }, undefined, () => { /* Keep the neutral surface on decoding failure. */ });
    texture.colorSpace = THREE.SRGBColorSpace;
    return () => { active = false; texture.dispose(); };
  }, [url, invalidate]);
  const texture = loaded?.url === url ? loaded.texture : null;
  return <group>
    <mesh name={`epaper-image-${index + 1}`} position={[0, 0, 0.02]} userData={{ customImage: Boolean(texture) }}><planeGeometry args={[0.57, 0.99]} /><meshBasicMaterial key={texture?.uuid ?? "blank"} map={texture} color={texture ? "#ffffff" : "#c8c9b9"} toneMapped={false} /></mesh>
    {!texture && <group position={[0, 0.04, 0.025]}><mesh><circleGeometry args={[0.15, 40]} /><meshBasicMaterial color={index ? "#626f6b" : "#8e8977"} /></mesh><mesh rotation={[0, 0, index ? 0.4 : -0.5]} position={[0, 0, 0.004]} scale={[1, 0.4, 1]}><ringGeometry args={[0.23, 0.239, 48]} /><meshBasicMaterial color="#8b8c78" /></mesh></group>}
  </group>;
}
