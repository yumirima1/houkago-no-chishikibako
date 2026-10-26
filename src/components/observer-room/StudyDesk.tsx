"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { StudyWorkstation } from "./StudyWorkstation";
import { ObserverActivityState, ObserverHotspotId } from "./types";
import { createWoodTexture } from "./proceduralTextures";

type StudyDeskProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  hoveredHotspot: ObserverHotspotId | null;
  onHoverHotspot: (id: ObserverHotspotId | null) => void;
  activity: ObserverActivityState;
};

/**
 * 研究机・椅子・ノート・PC・ランプ・珈琲
 * 実寸：幅1.8m × 奥行0.85m × 高さ0.74m
 * 位置：X = -0.3m, Z = -1.35m
 */
export function StudyDesk({
  onSelectHotspot,
  hoveredHotspot,
  onHoverHotspot,
  activity,
}: StudyDeskProps) {
  const steamRef = useRef<THREE.Group>(null);
  const lampLightRef = useRef<THREE.PointLight>(null);

  const woodTexture = useMemo(() => {
    return createWoodTexture("#4f3622", "#352315", 256, 256);
  }, []);

  // 珈琲の微かな湯気アニメーション
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (steamRef.current) {
      steamRef.current.position.y = 0.85 + Math.sin(t * 1.4) * 0.015;
      steamRef.current.rotation.y = t * 0.35;
    }
  });

  const isNoteHovered = hoveredHotspot === "desk-notes";

  return (
    <group position={[-0.3, 0, -1.35]}>
      {/* =======================
          1. 木製研究机本体（実寸 1.8m × 0.85m × 0.74m）
      ======================== */}
      {/* 天板 */}
      <mesh position={[0, 0.72, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.8, 0.05, 0.85]} />
        <meshStandardMaterial
          color="#4f3622"
          map={woodTexture}
          roughness={0.65}
        />
      </mesh>

      {/* 脚（4本角柱 0.07m角） */}
      {[
        [-0.82, -0.35],
        [0.82, -0.35],
        [-0.82, 0.35],
        [0.82, 0.35],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.34, z]} castShadow receiveShadow>
          <boxGeometry args={[0.07, 0.68, 0.07]} />
          <meshStandardMaterial color="#3d2716" roughness={0.7} />
        </mesh>
      ))}

      {/* 幕板 */}
      <mesh position={[0, 0.66, -0.34]}>
        <boxGeometry args={[1.64, 0.08, 0.03]} />
        <meshStandardMaterial color="#382414" roughness={0.7} />
      </mesh>

      {/* 左引き出しユニット（小引き出し2段） */}
      <group position={[-0.58, 0.48, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.42, 0.72]} />
          <meshStandardMaterial color="#442e1d" roughness={0.7} />
        </mesh>
        {/* 引き出しの前板と真鍮取っ手 */}
        {[-0.1, 0.1].map((y, idx) => (
          <group key={idx} position={[0, y, 0.365]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.34, 0.16, 0.015]} />
              <meshStandardMaterial color="#3a2718" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0, 0.015]}>
              <boxGeometry args={[0.08, 0.015, 0.015]} />
              <meshStandardMaterial color="#c5a059" metalness={0.8} roughness={0.25} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 机の上のレザースクライブマット（デスクマット 1.1m × 0.6m） */}
      <mesh position={[-0.1, 0.748, 0.02]} receiveShadow>
        <boxGeometry args={[1.15, 0.005, 0.62]} />
        <meshStandardMaterial color="#223026" roughness={0.85} />
      </mesh>

      {/* =======================
          2. 研究ノート (Hotspot: desk-notes)
      ======================== */}
      <group
        position={[-0.42, 0.752, 0.08]}
        rotation={[0, 0.07, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectHotspot("desk-notes");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverHotspot("desk-notes");
        }}
        onPointerOut={() => onHoverHotspot(null)}
      >
        {/* 開かれたノート（幅0.44m, 奥行0.3m） */}
        <mesh position={[-0.11, 0.008, 0]} rotation={[0, 0, 0.025]} castShadow>
          <boxGeometry args={[0.22, 0.012, 0.3]} />
          <meshStandardMaterial
            color={isNoteHovered ? "#fffcf2" : "#f4ebd8"}
            roughness={0.85}
          />
        </mesh>
        <mesh position={[0.11, 0.008, 0]} rotation={[0, 0, -0.025]} castShadow>
          <boxGeometry args={[0.22, 0.012, 0.3]} />
          <meshStandardMaterial
            color={isNoteHovered ? "#fffcf2" : "#f4ebd8"}
            roughness={0.85}
          />
        </mesh>
        {/* 革表紙の端 */}
        <mesh position={[0, 0.002, 0]}>
          <boxGeometry args={[0.46, 0.006, 0.32]} />
          <meshStandardMaterial color="#5a331c" roughness={0.7} />
        </mesh>
        {/* 手書き風罫線 */}
        {[-0.08, -0.04, 0, 0.04, 0.08].map((z, idx) => (
          <mesh key={idx} position={[-0.11, 0.015, z]}>
            <boxGeometry args={[0.16, 0.001, 0.006]} />
            <meshBasicMaterial color="#7a6f62" />
          </mesh>
        ))}
        {[-0.08, -0.04, 0, 0.04].map((z, idx) => (
          <mesh key={idx} position={[0.11, 0.015, z]}>
            <boxGeometry args={[0.16, 0.001, 0.006]} />
            <meshBasicMaterial color="#7a6f62" />
          </mesh>
        ))}
        {/* 万年筆 */}
        <group position={[0.25, 0.01, -0.02]} rotation={[0, -0.2, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.15, 8]} />
            <meshStandardMaterial color="#1f2937" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.005, 0.018, 6]} />
            <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
        {/* ホバーハイライト */}
        {isNoteHovered && (
          <mesh position={[0, 0.02, 0]}>
            <planeGeometry args={[0.5, 0.36]} />
            <meshBasicMaterial
              color="#e8b86d"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
        )}
      </group>

      {/* =======================
          3. PCワークステーション・モニター・ラジオ
      ======================== */}
      <StudyWorkstation
        onSelectHotspot={onSelectHotspot}
        hoveredHotspot={hoveredHotspot}
        onHoverHotspot={onHoverHotspot}
        activity={activity}
      />

      {/* =======================
          4. バンカーズデスクランプ
      ======================== */}
      <group position={[0.68, 0.74, -0.22]} rotation={[0, -0.25, 0]}>
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.024, 16]} />
          <meshStandardMaterial color="#c8a051" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.28, 8]} />
          <meshStandardMaterial color="#c8a051" metalness={0.75} roughness={0.3} />
        </mesh>
        <mesh position={[-0.05, 0.28, 0]} rotation={[0, 0, 0.18]}>
          <cylinderGeometry args={[0.045, 0.07, 0.18, 12, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color="#1a4637" roughness={0.2} metalness={0.1} />
        </mesh>
        <mesh position={[-0.05, 0.26, 0]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#ffe8b3" />
        </mesh>
        <pointLight
          ref={lampLightRef}
          position={[-0.05, 0.24, 0]}
          color="#ffdd99"
          intensity={activity === "thinking" ? 2.6 : 1.6}
          distance={2.8}
          decay={2}
          castShadow
        />
      </group>

      {/* =======================
          5. 珈琲マグと湯気
      ======================== */}
      <group position={[0.55, 0.74, 0.16]}>
        <mesh position={[0, 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.038, 0.032, 0.08, 16]} />
          <meshStandardMaterial color="#dedad0" roughness={0.4} />
        </mesh>
        <mesh position={[0.04, 0.04, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.02, 0.005, 6, 12]} />
          <meshStandardMaterial color="#dedad0" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.033, 0.033, 0.008, 12]} />
          <meshStandardMaterial color="#2d1c12" roughness={0.2} />
        </mesh>
        <group ref={steamRef} position={[0, 0.08, 0]}>
          {[0, 1].map((s) => (
            <mesh key={s} position={[0, s * 0.035, 0]} rotation={[0, s * 0.8, 0]}>
              <ringGeometry args={[0.012 + s * 0.008, 0.022 + s * 0.008, 8]} />
              <meshBasicMaterial color="#f0f0f0" transparent opacity={0.2 - s * 0.07} />
            </mesh>
          ))}
        </group>
      </group>

      {/* =======================
          6. 木製アームチェア（実寸 座面幅0.54m, 座面高0.44m）
      ======================== */}
      <group position={[0, 0, 0.62]} rotation={[0, Math.PI, 0]}>
        {/* 座面 */}
        <mesh position={[0, 0.42, 0]} castShadow>
          <boxGeometry args={[0.52, 0.06, 0.48]} />
          <meshStandardMaterial color="#4a3220" roughness={0.7} />
        </mesh>
        {/* クッション */}
        <mesh position={[0, 0.46, 0]}>
          <boxGeometry args={[0.46, 0.035, 0.42]} />
          <meshStandardMaterial color="#2e4235" roughness={0.9} />
        </mesh>
        {/* 背もたれ */}
        <mesh position={[0, 0.78, 0.2]} rotation={[-0.08, 0, 0]} castShadow>
          <boxGeometry args={[0.48, 0.5, 0.05]} />
          <meshStandardMaterial color="#4a3220" roughness={0.7} />
        </mesh>
        {/* 脚（4本） */}
        {[
          [-0.2, -0.18],
          [0.2, -0.18],
          [-0.2, 0.18],
          [0.2, 0.18],
        ].map(([x, z], idx) => (
          <mesh key={idx} position={[x, 0.21, z]} castShadow>
            <cylinderGeometry args={[0.018, 0.014, 0.42, 8]} />
            <meshStandardMaterial color="#3a2415" roughness={0.7} />
          </mesh>
        ))}
        {/* 肘掛け */}
        <mesh position={[-0.24, 0.58, 0.02]}>
          <boxGeometry args={[0.045, 0.025, 0.32]} />
          <meshStandardMaterial color="#4a3220" roughness={0.7} />
        </mesh>
        <mesh position={[0.24, 0.58, 0.02]}>
          <boxGeometry args={[0.045, 0.025, 0.32]} />
          <meshStandardMaterial color="#4a3220" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}
