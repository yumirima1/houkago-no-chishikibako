"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { ObserverActivityState, ObserverHotspotId } from "./types";

type StudyWorkstationProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  hoveredHotspot: ObserverHotspotId | null;
  onHoverHotspot: (id: ObserverHotspotId | null) => void;
  activity: ObserverActivityState;
};

export function StudyWorkstation({
  onSelectHotspot,
  hoveredHotspot,
  onHoverHotspot,
  activity,
}: StudyWorkstationProps) {
  const radioTubeRef = useRef<THREE.PointLight>(null);

  // ラジオの真空管の微細な暖色のゆらぎ
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (radioTubeRef.current) {
      radioTubeRef.current.intensity = 0.45 + Math.sin(t * 3.0) * 0.08;
    }
  });

  const isPCHovered = hoveredHotspot === "pc-workstation";
  const isMonitorHovered = hoveredHotspot === "monitor-display";
  const isRadioHovered = hoveredHotspot === "radio-audio";

  const isGathering = activity === "gathering";

  return (
    <group position={[0, 0, 0]}>
      {/* =========================================
          1. デュアルモニター（中央＆サブ）
          Hotspot: monitor-display (閲覧・ニュース・考察)
      ========================================== */}
      <group
        position={[0.15, 0.78, -0.32]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectHotspot("monitor-display");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverHotspot("monitor-display");
        }}
        onPointerOut={() => onHoverHotspot(null)}
      >
        {/* メインモニター（正面） */}
        {/* スタンド */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.24, 8]} />
          <meshStandardMaterial color="#2d3748" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.08, 0.09, 0.015, 12]} />
          <meshStandardMaterial color="#2d3748" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* ベゼル */}
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.62, 0.38, 0.03]} />
          <meshStandardMaterial color="#1f2937" roughness={0.6} />
        </mesh>
        {/* ディスプレイ画面（落ち着いたセージ/アンバー調） */}
        <mesh position={[0, 0.28, 0.018]}>
          <planeGeometry args={[0.58, 0.34]} />
          <meshBasicMaterial
            color={
              isMonitorHovered
                ? "#bbf7d0"
                : isGathering
                ? "#86efac"
                : "#6ee7b7"
            }
          />
        </mesh>
        {/* 画面上のテキスト行風ライン */}
        {[-0.08, -0.04, 0, 0.04, 0.08].map((y, i) => (
          <mesh key={i} position={[-0.05, 0.28 + y, 0.019]}>
            <planeGeometry args={[0.38, 0.012]} />
            <meshBasicMaterial color="#064e3b" />
          </mesh>
        ))}

        {/* サブモニター（右斜め） */}
        <group position={[0.42, 0.26, 0.06]} rotation={[0, -0.38, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.32, 0.34, 0.025]} />
            <meshStandardMaterial color="#1f2937" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.015]}>
            <planeGeometry args={[0.29, 0.31]} />
            <meshBasicMaterial color={isMonitorHovered ? "#fed7aa" : "#fdba74"} />
          </mesh>
        </group>

        {/* モニターからの柔らかな画面光 */}
        <pointLight
          position={[0, 0.3, 0.2]}
          color="#a7f3d0"
          intensity={isGathering ? 1.2 : 0.6}
          distance={1.8}
          decay={2}
        />

        {/* ホバーハイライト */}
        {isMonitorHovered && (
          <mesh position={[0, 0.28, 0]}>
            <boxGeometry args={[0.64, 0.4, 0.05]} />
            <meshBasicMaterial
              color="#34d399"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
        )}
      </group>

      {/* =========================================
          2. PC本体・キーボード・記憶検索
          Hotspot: pc-workstation
      ========================================== */}
      <group
        position={[0.15, 0.78, -0.06]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectHotspot("pc-workstation");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverHotspot("pc-workstation");
        }}
        onPointerOut={() => onHoverHotspot(null)}
      >
        {/* キーボード */}
        <mesh position={[0, 0.01, 0]} castShadow>
          <boxGeometry args={[0.4, 0.015, 0.14]} />
          <meshStandardMaterial color="#374151" roughness={0.5} />
        </mesh>
        {/* キーの配列風 */}
        <mesh position={[0, 0.019, 0]}>
          <planeGeometry args={[0.38, 0.12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
        {/* マウス */}
        <mesh position={[0.26, 0.01, 0.02]}>
          <boxGeometry args={[0.06, 0.02, 0.1]} />
          <meshStandardMaterial color="#374151" roughness={0.5} />
        </mesh>

        {/* デスク下のコンパクトPC本体（ウッドベゼル仕様） */}
        <group position={[0.78, -0.42, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.18, 0.38, 0.42]} />
            <meshStandardMaterial color="#2d3748" roughness={0.6} />
          </mesh>
          {/* 前面木製フロントパネル */}
          <mesh position={[0, 0, 0.215]}>
            <planeGeometry args={[0.17, 0.36]} />
            <meshStandardMaterial color="#4a3728" roughness={0.7} />
          </mesh>
          {/* 電源・アクセスランプ（微かな緑点滅） */}
          <mesh position={[0.04, 0.14, 0.22]}>
            <sphereGeometry args={[0.006, 8, 8]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
        </group>

        {/* ホバーハイライト */}
        {isPCHovered && (
          <mesh position={[0.08, 0.015, 0]}>
            <boxGeometry args={[0.56, 0.03, 0.2]} />
            <meshBasicMaterial
              color="#38bdf8"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
        )}
      </group>

      {/* =========================================
          3. 木製真空管風ラジオ (RADIO 受信機)
          Hotspot: radio-audio
      ========================================== */}
      <group
        position={[-0.88, 0.78, -0.05]}
        rotation={[0, 0.25, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectHotspot("radio-audio");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverHotspot("radio-audio");
        }}
        onPointerOut={() => onHoverHotspot(null)}
      >
        {/* 木製キャビネット外装 */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.3, 0.22, 0.18]} />
          <meshStandardMaterial color="#543820" roughness={0.65} />
        </mesh>
        {/* スピーカーの麻布グリル */}
        <mesh position={[-0.06, 0.12, 0.092]}>
          <planeGeometry args={[0.13, 0.18]} />
          <meshStandardMaterial color="#d4c3a3" roughness={0.9} />
        </mesh>
        {/* 周波数チューニング窓 */}
        <mesh position={[0.07, 0.15, 0.092]}>
          <planeGeometry args={[0.11, 0.07]} />
          <meshStandardMaterial color="#1a140f" roughness={0.3} />
        </mesh>
        {/* チューニング針とダイヤルバックライト */}
        <mesh position={[0.07, 0.15, 0.093]}>
          <planeGeometry args={[0.09, 0.05]} />
          <meshBasicMaterial color="#fef08a" />
        </mesh>
        {/* 真鍮の回転ダイヤル */}
        <mesh position={[0.07, 0.06, 0.095]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.015, 12]} />
          <meshStandardMaterial color="#c5a059" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* 伸縮式アンテナ */}
        <mesh position={[-0.12, 0.32, -0.06]} rotation={[0, 0, -0.15]}>
          <cylinderGeometry args={[0.004, 0.005, 0.34, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* 内部真空管の温かい光 */}
        <pointLight
          ref={radioTubeRef}
          position={[0.07, 0.15, 0.08]}
          color="#f59e0b"
          intensity={0.45}
          distance={1.2}
          decay={2}
        />

        {/* ホバーハイライト */}
        {isRadioHovered && (
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.32, 0.24, 0.2]} />
            <meshBasicMaterial
              color="#f59e0b"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}
