"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { ObserverHotspotId } from "./types";
import { createFabricTexture } from "./proceduralTextures";

type StudyBedProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  isNightOrResting: boolean;
};

/**
 * 観察者の生活と休息の空間（ベッド＆ナイトスタンド）
 * 実寸：幅1.25m × 長さ2.05m × 高さ0.48m
 * 配置：右壁際（X = +2.9m, Z = 0.15m）
 */
export function StudyBed({
  onSelectHotspot,
  isHovered,
  onHover,
  isNightOrResting,
}: StudyBedProps) {
  const fabricTexture = useMemo(() => {
    return createFabricTexture("#3f5244", 256, 256);
  }, []);

  return (
    <group
      position={[2.9, 0, 0.15]}
      rotation={[0, -Math.PI / 2, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelectHotspot("bed-rest");
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      {/* クリック検出用インビジブルボックス */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.35, 0.9, 2.15]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* ホバーハイライト */}
      {isHovered && (
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.38, 0.94, 2.18]} />
          <meshBasicMaterial
            color="#a3e635"
            wireframe
            transparent
            opacity={0.65}
          />
        </mesh>
      )}

      {/* =======================
          木製ベッドフレーム（無垢オーク）
      ======================== */}
      {/* ヘッドボード（奥の背板 幅1.25m × 高さ0.75m） */}
      <mesh position={[0, 0.55, -1.02]} castShadow>
        <boxGeometry args={[1.25, 0.75, 0.06]} />
        <meshStandardMaterial color="#3d2817" roughness={0.7} />
      </mesh>
      {/* フットボード */}
      <mesh position={[0, 0.32, 1.02]} castShadow>
        <boxGeometry args={[1.25, 0.35, 0.06]} />
        <meshStandardMaterial color="#3d2817" roughness={0.7} />
      </mesh>
      {/* サイドフレーム */}
      {[-0.6, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.16, 2.0]} />
          <meshStandardMaterial color="#3d2817" roughness={0.7} />
        </mesh>
      ))}
      {/* 脚（4本） */}
      {[
        [-0.56, -0.96],
        [0.56, -0.96],
        [-0.56, 0.96],
        [0.56, 0.96],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.1, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.025, 0.2, 8]} />
          <meshStandardMaterial color="#301f12" roughness={0.8} />
        </mesh>
      ))}

      {/* =======================
          マットレス＆リネン・毛布
      ======================== */}
      {/* マットレス本体 */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.2, 1.95]} />
        <meshStandardMaterial color="#eae5da" roughness={0.9} />
      </mesh>
      {/* 折り返されたシーツ */}
      <mesh position={[0, 0.41, -0.42]}>
        <boxGeometry args={[1.12, 0.025, 0.38]} />
        <meshStandardMaterial color="#f5f0e6" roughness={0.95} />
      </mesh>
      {/* 毛布（上質リネンファブリック） */}
      <mesh position={[0, 0.42, 0.25]} castShadow>
        <boxGeometry args={[1.13, 0.038, 1.2]} />
        <meshStandardMaterial
          color="#3f5244"
          map={fabricTexture}
          roughness={0.85}
        />
      </mesh>
      {/* 枕（ピロー） */}
      <mesh position={[0, 0.43, -0.72]} rotation={[-0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.65, 0.1, 0.38]} />
        <meshStandardMaterial color="#f7f3ec" roughness={0.9} />
      </mesh>

      {/* =======================
          サイドチェスト＆ナイトランプ
      ======================== */}
      <group position={[-0.9, 0, -0.85]}>
        {/* ナイトスタンド（幅0.4m × 奥行0.4m × 高さ0.48m） */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <boxGeometry args={[0.4, 0.48, 0.4]} />
          <meshStandardMaterial color="#442e1d" roughness={0.7} />
        </mesh>
        {/* 真鍮の引き出しつまみ */}
        <mesh position={[0.205, 0.32, 0]}>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.25} />
        </mesh>
        {/* ランプ台座 */}
        <mesh position={[0, 0.49, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.02, 12]} />
          <meshStandardMaterial color="#352315" roughness={0.7} />
        </mesh>
        {/* 支柱 */}
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.007, 0.007, 0.2, 8]} />
          <meshStandardMaterial color="#c8a051" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* 布シェード */}
        <mesh position={[0, 0.68, 0]}>
          <coneGeometry args={[0.1, 0.13, 12, 1, true]} />
          <meshStandardMaterial color="#f5eedc" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
        {/* 温かいナイトライト点光源 */}
        <pointLight
          position={[0, 0.66, 0]}
          color="#ffc97a"
          intensity={isNightOrResting ? 1.6 : 0.35}
          distance={2.6}
          decay={2}
        />
        {/* ベッドサイドの小さな本 */}
        <mesh position={[0.08, 0.495, 0.08]} rotation={[0, 0.2, 0]}>
          <boxGeometry args={[0.13, 0.02, 0.18]} />
          <meshStandardMaterial color="#6a3528" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}
