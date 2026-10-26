"use client";

import { useMemo } from "react";
import { ObserverHotspotId } from "./types";

const BOOK_COLORS = [
  "#592d24", // バーガンディ・革
  "#26402e", // フォレストグリーン
  "#263445", // ディープネイビー
  "#4a3828", // アンティークブラウン
  "#61523f", // キャメル・麻
  "#824d3b", // テラコッタ
  "#3d3d3d", // チャコール
];

type StudyBookshelfProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
};

/**
 * 大型書架（本棚）
 * 実寸：幅2.2m × 奥行0.36m × 高さ2.25m
 * 配置：左壁際（X = -3.95m, Z = -0.4m, Y = 0m, 90度回転）
 */
export function StudyBookshelf({
  onSelectHotspot,
  isHovered,
  onHover,
}: StudyBookshelfProps) {
  const shelvesData = useMemo(() => {
    const shelves = [];
    const shelfHeights = [0.42, 0.92, 1.42, 1.92]; // 4段

    for (let s = 0; s < shelfHeights.length; s++) {
      const y = shelfHeights[s];
      const books = [];
      let currentX = -1.0;

      while (currentX < 1.0) {
        const width = 0.035 + (Math.sin(s * 10 + currentX * 7) + 1) * 0.02;
        const height = 0.24 + (Math.cos(s * 5 + currentX * 9) + 1) * 0.07;
        const depth = 0.24;
        const color =
          BOOK_COLORS[
            Math.abs(Math.floor(s * 11 + currentX * 13)) % BOOK_COLORS.length
          ];
        const pseudoRand = Math.abs(Math.sin(s * 31.7 + currentX * 47.3));
        const isLeaning = pseudoRand > 0.88 && currentX > 0.7;

        books.push({
          x: currentX + width / 2,
          y: y + height / 2 + 0.02,
          width,
          height,
          depth,
          color,
          tilt: isLeaning ? 0.15 : 0,
        });

        currentX += width + 0.005;
      }
      shelves.push(books);
    }
    return shelves;
  }, []);

  return (
    <group
      position={[-4.0, 0, -0.4]}
      rotation={[0, Math.PI / 2, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelectHotspot("bookshelf");
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
    >
      {/* クリック検出用インビジブルボックス */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[2.3, 2.3, 0.45]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* ホバーハイライト */}
      {isHovered && (
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[2.34, 2.34, 0.48]} />
          <meshBasicMaterial
            color="#e8b86d"
            wireframe
            transparent
            opacity={0.65}
          />
        </mesh>
      )}

      {/* =======================
          木製書棚フレーム（実寸 幅2.2m × 奥行0.36m × 高さ2.25m）
      ======================== */}
      {/* 左右側板 */}
      <mesh position={[-1.1, 1.15, 0]} castShadow>
        <boxGeometry args={[0.05, 2.25, 0.36]} />
        <meshStandardMaterial color="#3a2515" roughness={0.7} />
      </mesh>
      <mesh position={[1.1, 1.15, 0]} castShadow>
        <boxGeometry args={[0.05, 2.25, 0.36]} />
        <meshStandardMaterial color="#3a2515" roughness={0.7} />
      </mesh>
      {/* 天板 */}
      <mesh position={[0, 2.26, 0]}>
        <boxGeometry args={[2.26, 0.05, 0.38]} />
        <meshStandardMaterial color="#3e2717" roughness={0.7} />
      </mesh>
      {/* 台座 */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[2.26, 0.12, 0.38]} />
        <meshStandardMaterial color="#3a2515" roughness={0.7} />
      </mesh>
      {/* 背板 */}
      <mesh position={[0, 1.15, -0.16]}>
        <boxGeometry args={[2.16, 2.2, 0.03]} />
        <meshStandardMaterial color="#2c1a0e" roughness={0.8} />
      </mesh>

      {/* 棚板（4枚） */}
      {[0.42, 0.92, 1.42, 1.92].map((y, idx) => (
        <mesh key={idx} position={[0, y, 0]} receiveShadow>
          <boxGeometry args={[2.15, 0.035, 0.34]} />
          <meshStandardMaterial color="#3e2717" roughness={0.7} />
        </mesh>
      ))}

      {/* 書籍群 */}
      {shelvesData.map((shelf, shelfIdx) => (
        <group key={shelfIdx}>
          {shelf.map((book, bookIdx) => (
            <group
              key={bookIdx}
              position={[book.x, book.y, 0]}
              rotation={[0, 0, book.tilt]}
            >
              <mesh castShadow receiveShadow>
                <boxGeometry args={[book.width, book.height, book.depth]} />
                <meshStandardMaterial color={book.color} roughness={0.75} />
              </mesh>
              {bookIdx % 4 === 0 && (
                <mesh position={[0, 0.03, book.depth / 2 + 0.002]}>
                  <planeGeometry args={[book.width * 0.8, 0.01]} />
                  <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      ))}

      {/* 最上段の置物：丸めた古地図・標本 */}
      <group position={[0.55, 2.02, 0.02]} rotation={[0, 0.15, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.28, 12]} />
          <meshStandardMaterial color="#d9caa7" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}
