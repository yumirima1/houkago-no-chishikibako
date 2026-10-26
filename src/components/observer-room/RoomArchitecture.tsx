"use client";

import { useMemo } from "react";
import { createPlasterTexture, createWoodTexture } from "./proceduralTextures";

/**
 * 部屋の建築構造
 * 実寸スケール：幅8.4m × 奥行7.2m × 天井高3.0m
 * 木製パーケット床、漆喰壁、巾木・廻り縁、出入口ドア、木製化粧梁
 */
export function RoomArchitecture() {
  const woodFloorTexture = useMemo(() => {
    const tex = createWoodTexture("#4a3320", "#332113", 512, 512);
    tex.repeat.set(8, 8);
    return tex;
  }, []);

  const plasterTexture = useMemo(() => {
    return createPlasterTexture(256, 256);
  }, []);

  return (
    <group>
      {/* =========================================
          1. 床 (Flooring: オーク材パーケット)
          幅8.4m × 奥行7.2m
      ========================================== */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[8.4, 7.2]} />
        <meshStandardMaterial
          color="#523924"
          map={woodFloorTexture}
          roughness={0.6}
          metalness={0.05}
        />
      </mesh>

      {/* 机の下の落ち着いたウールラグ（アースグリーン・アンティーク調 2.6m x 2.0m） */}
      <mesh
        position={[-0.2, 0.005, -1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[2.6, 2.0]} />
        <meshStandardMaterial
          color="#334237"
          roughness={0.95}
        />
      </mesh>
      {/* ラグの控えめな縁取りライン */}
      <mesh
        position={[-0.2, 0.006, -1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[1.2, 1.25, 4]} />
        <meshStandardMaterial color="#4d5c50" roughness={0.95} />
      </mesh>

      {/* =========================================
          2. 壁面 (漆喰調・マットアイボリー)
          幅8.4m × 奥行7.2m × 高さ3.0m
      ========================================== */}
      {/* 奥壁（Z = -3.6m）: 窓の開口部（幅3.0m, 高さ2.0m, Y=0.85〜2.85m）を挟む壁構成 */}
      {/* 窓の下の壁（腰壁） */}
      <mesh position={[0, 0.425, -3.6]} receiveShadow>
        <boxGeometry args={[8.4, 0.85, 0.1]} />
        <meshStandardMaterial
          color="#ece8df"
          bumpMap={plasterTexture}
          bumpScale={0.002}
          roughness={0.95}
        />
      </mesh>
      {/* 窓の上の垂れ壁 */}
      <mesh position={[0, 2.925, -3.6]}>
        <boxGeometry args={[8.4, 0.15, 0.1]} />
        <meshStandardMaterial
          color="#ece8df"
          bumpMap={plasterTexture}
          bumpScale={0.002}
          roughness={0.95}
        />
      </mesh>
      {/* 窓の左側の壁（ピンボードの置かれる壁） */}
      <mesh position={[-2.95, 1.85, -3.6]} receiveShadow>
        <boxGeometry args={[2.5, 2.0, 0.1]} />
        <meshStandardMaterial
          color="#ece8df"
          bumpMap={plasterTexture}
          bumpScale={0.002}
          roughness={0.95}
        />
      </mesh>
      {/* 窓の右側の壁 */}
      <mesh position={[2.95, 1.85, -3.6]} receiveShadow>
        <boxGeometry args={[2.5, 2.0, 0.1]} />
        <meshStandardMaterial
          color="#ece8df"
          bumpMap={plasterTexture}
          bumpScale={0.002}
          roughness={0.95}
        />
      </mesh>

      {/* 左壁（X = -4.2m）: 本棚と出入口ドア */}
      <mesh
        position={[-4.2, 1.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[7.2, 3.0]} />
        <meshStandardMaterial
          color="#e6e2d8"
          bumpMap={plasterTexture}
          bumpScale={0.002}
          roughness={0.95}
        />
      </mesh>

      {/* 右壁（X = +4.2m）: ベッド側の壁 */}
      <mesh
        position={[4.2, 1.5, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[7.2, 3.0]} />
        <meshStandardMaterial
          color="#e6e2d8"
          bumpMap={plasterTexture}
          bumpScale={0.002}
          roughness={0.95}
        />
      </mesh>

      {/* =========================================
          3. 出入口ドア (Entrance Door)
          左壁の手前寄り（X = -4.18m, Z = 2.1m）
          幅0.95m × 高さ2.15m
      ========================================== */}
      <group position={[-4.18, 1.08, 2.1]} rotation={[0, Math.PI / 2, 0]}>
        {/* ドア枠 */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.05, 2.2, 0.08]} />
          <meshStandardMaterial color="#3a2718" roughness={0.7} />
        </mesh>
        {/* ドアパネル本体（深みのある木製パネル） */}
        <mesh position={[0, 0, 0.015]}>
          <boxGeometry args={[0.95, 2.12, 0.04]} />
          <meshStandardMaterial color="#4a3320" roughness={0.65} />
        </mesh>
        {/* 上下モールディング装飾 */}
        <mesh position={[0, 0.45, 0.038]}>
          <boxGeometry args={[0.75, 0.75, 0.01]} />
          <meshStandardMaterial color="#3d2817" roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.45, 0.038]}>
          <boxGeometry args={[0.75, 0.75, 0.01]} />
          <meshStandardMaterial color="#3d2817" roughness={0.7} />
        </mesh>
        {/* 真鍮ドアレバーハンドル */}
        <group position={[-0.38, 0, 0.05]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.016, 0.016, 0.04, 8]} />
            <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[-0.05, 0, 0.02]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.12, 0.02, 0.02]} />
            <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      </group>

      {/* =========================================
          4. 巾木 (Baseboards: 床と壁の境界)
      ========================================== */}
      <mesh position={[0, 0.08, -3.54]}>
        <boxGeometry args={[8.4, 0.16, 0.02]} />
        <meshStandardMaterial color="#382517" roughness={0.7} />
      </mesh>
      <mesh position={[-4.14, 0.08, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[7.2, 0.16, 0.02]} />
        <meshStandardMaterial color="#382517" roughness={0.7} />
      </mesh>
      <mesh position={[4.14, 0.08, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[7.2, 0.16, 0.02]} />
        <meshStandardMaterial color="#382517" roughness={0.7} />
      </mesh>

      {/* =========================================
          5. 天井と木製化粧梁 (Ceiling & Beams)
      ========================================== */}
      <mesh position={[0, 3.0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.4, 7.2]} />
        <meshStandardMaterial color="#f2eee8" roughness={0.95} />
      </mesh>
      {/* 3本の木製梁 */}
      {[-2.0, 0, 2.0].map((zPos, idx) => (
        <mesh key={idx} position={[0, 2.88, zPos]} castShadow>
          <boxGeometry args={[8.38, 0.24, 0.2]} />
          <meshStandardMaterial color="#3e2a1b" roughness={0.75} />
        </mesh>
      ))}
    </group>
  );
}
