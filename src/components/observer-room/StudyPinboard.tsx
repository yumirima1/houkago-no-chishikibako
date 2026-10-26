"use client";

import { useMemo } from "react";
import { ObserverHotspotId } from "./types";

type StudyPinboardProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  knowledgeLevel: number;
};

/**
 * 壁の掲示板（コルクボード・未解決の問い・相関図・写真）
 * 実寸：幅1.5m × 高さ1.0m
 * 配置：奥壁（X = -2.6m, Y = 1.75m, Z = -3.54m）
 */
export function StudyPinboard({
  onSelectHotspot,
  isHovered,
  onHover,
  knowledgeLevel,
}: StudyPinboardProps) {
  const pinItems = useMemo(() => {
    const baseItems = [
      { x: -0.46, y: 0.2, w: 0.28, h: 0.22, color: "#455948", type: "photo" },
      { x: 0.05, y: 0.24, w: 0.24, h: 0.2, color: "#fef08a", type: "question" },
      { x: 0.46, y: 0.16, w: 0.26, h: 0.28, color: "#f5ebe0", type: "note" },
      { x: -0.4, y: -0.2, w: 0.3, h: 0.22, color: "#59687a", type: "photo" },
      { x: 0.1, y: -0.16, w: 0.24, h: 0.22, color: "#fed7aa", type: "question" },
      { x: 0.48, y: -0.22, w: 0.25, h: 0.25, color: "#fdf8ee", type: "note" },
    ];
    const count = Math.min(baseItems.length, 2 + knowledgeLevel);
    return baseItems.slice(0, count);
  }, [knowledgeLevel]);

  return (
    <group
      position={[-2.6, 1.75, -3.54]}
      onClick={(e) => {
        e.stopPropagation();
        onSelectHotspot("pinboard");
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      {/* クリック検出用プレーン */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.54, 1.04]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* ホバーハイライト */}
      {isHovered && (
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[1.56, 1.06]} />
          <meshBasicMaterial
            color="#fbbf24"
            wireframe
            transparent
            opacity={0.65}
          />
        </mesh>
      )}

      {/* 木製外枠（1.5m × 1.0m） */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.5, 1.0, 0.035]} />
        <meshStandardMaterial color="#4a3422" roughness={0.7} />
      </mesh>
      {/* コルク面 */}
      <mesh position={[0, 0, 0.012]}>
        <planeGeometry args={[1.4, 0.9]} />
        <meshStandardMaterial color="#a37f5b" roughness={0.95} />
      </mesh>

      {/* ピン留めされた写真・メモ */}
      {pinItems.map((item, idx) => (
        <group key={idx} position={[item.x, item.y, 0.022]}>
          <mesh castShadow>
            <planeGeometry args={[item.w, item.h]} />
            <meshStandardMaterial color={item.color} roughness={0.8} />
          </mesh>
          {item.type === "photo" && (
            <mesh position={[0, 0, -0.001]}>
              <planeGeometry args={[item.w + 0.025, item.h + 0.035]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          )}
          {/* 赤いプッシュピン */}
          <mesh position={[0, item.h / 2 - 0.018, 0.01]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshStandardMaterial color="#dc2626" roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* 相関関係の赤い糸 */}
      {pinItems.length >= 2 && (
        <mesh position={[-0.18, 0.02, 0.025]}>
          <boxGeometry args={[0.42, 0.003, 0.002]} />
          <meshBasicMaterial color="#b91c1c" />
        </mesh>
      )}
    </group>
  );
}
