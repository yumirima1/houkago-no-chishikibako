"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ObserverHotspotId } from "./types";

type StudyWindowProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
};

/**
 * 窓と外景の完全再構築
 * 幅3.0m × 高さ2.0m（Y=0.85m〜2.85m, Z=-3.6m）
 * 三角錐ポリゴンを完全廃止し、遠景の山並み・中景森林・近景の揺らぎ・物理透過ガラスで構築
 */
export function StudyWindow({
  onSelectHotspot,
  isHovered,
  onHover,
}: StudyWindowProps) {
  const leavesRef = useRef<THREE.InstancedMesh>(null);

  // 近景の揺れる枝葉
  const leafCount = 36;
  const leafData = useMemo(() => {
    return Array.from({ length: leafCount }, (_, i) => ({
      basePos: new THREE.Vector3(
        -1.8 + (i % 9) * 0.45 + (Math.sin(i * 1.3) * 0.2),
        -0.4 + Math.floor(i / 9) * 0.5 + (Math.cos(i * 1.7) * 0.15),
        -1.2 - (i % 4) * 0.3
      ),
      scale: 0.08 + (i % 5) * 0.025,
      speed: 0.5 + (i % 4) * 0.25,
      offset: i * 0.6,
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // 遠景の山並み（滑らかな有機的起伏メッシュ）
  const mountainGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(24, 7, 32, 16);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      // 自然な稜線のうねり
      const zOffset =
        Math.sin(u * 0.25) * 1.4 +
        Math.cos(u * 0.55) * 0.8 +
        Math.sin(u * 0.1) * 2.0 -
        Math.pow(Math.abs(u) * 0.08, 1.8);
      pos.setZ(i, zOffset);
      // 山の頂上に向けて高さを調整
      if (v < 0) {
        pos.setY(i, v * 0.4);
      }
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (leavesRef.current) {
      leafData.forEach((leaf, i) => {
        const x = leaf.basePos.x + Math.sin(t * leaf.speed + leaf.offset) * 0.08;
        const y = leaf.basePos.y + Math.cos(t * leaf.speed * 0.7 + leaf.offset) * 0.06;
        const z = leaf.basePos.z;

        dummy.position.set(x, y, z);
        dummy.rotation.set(
          Math.sin(t * 0.8 + leaf.offset) * 0.15,
          t * 0.3 + leaf.offset,
          Math.cos(t * 0.6 + leaf.offset) * 0.15
        );
        dummy.scale.setScalar(leaf.scale);
        dummy.updateMatrix();
        leavesRef.current?.setMatrixAt(i, dummy.matrix);
      });
      leavesRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group position={[0, 1.85, -3.58]}>
      {/* =========================================
          1. 外界の自然景観 (Exterior Nature Panorama)
          Z = -1.5m 〜 -16m にかけて距離感・大気感を配置
      ========================================== */}
      <group position={[0, 0, -1.8]}>
        {/* 大気と空のパノラマ（グラデーション空） */}
        <mesh position={[0, 1.2, -14.0]}>
          <planeGeometry args={[32, 16]} />
          <meshBasicMaterial color="#94bed1" />
        </mesh>
        {/* 遠方の地平線・大気ヘイズ */}
        <mesh position={[0, -0.6, -13.8]}>
          <planeGeometry args={[32, 6]} />
          <meshBasicMaterial color="#c2dbe6" transparent opacity={0.65} />
        </mesh>

        {/* 遠景：雄大な山並み（滑らかな稜線メッシュ） */}
        <mesh
          position={[0, 0.4, -11.0]}
          rotation={[-0.1, 0, 0]}
          geometry={mountainGeometry}
        >
          <meshLambertMaterial color="#6a8b87" />
        </mesh>

        {/* 中景：深緑の森林帯（起伏のある丘陵キャノピー） */}
        <group position={[0, -0.8, -6.5]}>
          {[-6, -4, -2, 0, 2, 4, 6].map((x, idx) => (
            <mesh
              key={idx}
              position={[x + (idx % 2) * 0.5, 0.8 + (idx % 3) * 0.25, 0]}
              scale={[1.8, 1.4 + (idx % 2) * 0.3, 1.2]}
            >
              <sphereGeometry args={[1.2, 16, 12]} />
              <meshLambertMaterial
                color={idx % 2 === 0 ? "#3b5840" : "#44644a"}
              />
            </mesh>
          ))}
        </group>

        {/* 近景：窓外の木々の枝と葉（そよ風のゆらぎ） */}
        <instancedMesh
          ref={leavesRef}
          args={[undefined, undefined, leafCount]}
          position={[0, 0, 0]}
        >
          <dodecahedronGeometry args={[0.3, 0]} />
          <meshLambertMaterial color="#507952" />
        </instancedMesh>
      </group>

      {/* =========================================
          2. 窓からの自然光（太陽光の木漏れ日）
      ========================================== */}
      <spotLight
        position={[0.5, 1.8, 0.4]}
        target-position={[0, -1.2, 2.8]}
        intensity={3.4}
        color="#fff4e3"
        angle={0.85}
        penumbra={0.75}
        castShadow
        shadow-bias={-0.0001}
      />

      {/* =========================================
          3. 物理ガラス（透明感・屈折・反射）
          幅3.0m × 高さ2.0m
      ========================================== */}
      <mesh
        position={[0, 0, 0.04]}
        onClick={(e) => {
          e.stopPropagation();
          onSelectHotspot("window");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
        }}
        onPointerOut={() => onHover(false)}
      >
        <planeGeometry args={[3.0, 2.0]} />
        <meshPhysicalMaterial
          color="#f2f8fa"
          transmission={0.93}
          opacity={0.3}
          transparent
          roughness={0.08}
          ior={1.5}
          reflectivity={0.65}
        />
      </mesh>

      {/* ホバー時の控えめな温かいアウトライン */}
      {isHovered && (
        <mesh position={[0, 0, 0.06]}>
          <planeGeometry args={[3.04, 2.04]} />
          <meshBasicMaterial
            color="#ffeaa7"
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* =========================================
          4. 木製窓枠・格子桟・窓台
      ========================================== */}
      {/* 窓台（下部シル：小物を置ける幅広の無垢材） */}
      <mesh position={[0, -1.02, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.12, 0.28]} />
        <meshStandardMaterial color="#422d1c" roughness={0.65} />
      </mesh>
      {/* 上枠 */}
      <mesh position={[0, 1.02, 0.04]}>
        <boxGeometry args={[3.12, 0.1, 0.18]} />
        <meshStandardMaterial color="#4a3422" roughness={0.7} />
      </mesh>
      {/* 左右縦枠 */}
      <mesh position={[-1.52, 0, 0.04]}>
        <boxGeometry args={[0.1, 2.04, 0.18]} />
        <meshStandardMaterial color="#4a3422" roughness={0.7} />
      </mesh>
      <mesh position={[1.52, 0, 0.04]}>
        <boxGeometry args={[0.1, 2.04, 0.18]} />
        <meshStandardMaterial color="#4a3422" roughness={0.7} />
      </mesh>

      {/* 格子桟（細身で端正なクラシック窓桟） */}
      {/* 垂直桟（左右対称 2本） */}
      {[-0.5, 0.5].map((x, i) => (
        <mesh key={i} position={[x, 0, 0.02]}>
          <boxGeometry args={[0.045, 1.98, 0.06]} />
          <meshStandardMaterial color="#543c29" roughness={0.7} />
        </mesh>
      ))}
      {/* 水平桟（上下 2本） */}
      {[-0.35, 0.35].map((y, i) => (
        <mesh key={i} position={[0, y, 0.02]}>
          <boxGeometry args={[2.98, 0.045, 0.06]} />
          <meshStandardMaterial color="#543c29" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
