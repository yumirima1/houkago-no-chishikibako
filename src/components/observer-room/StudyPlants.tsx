"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ObserverHotspotId } from "./types";

type StudyPlantsProps = {
  onSelectHotspot: (id: ObserverHotspotId) => void;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
};

/**
 * 観葉植物（大型鉢植えフィカス／モンステラ）
 * 実寸：鉢直径0.45m × 全高1.25m
 * 配置：奥壁右手（X = +2.7m, Z = -2.9m）
 */
export function StudyPlants({
  onSelectHotspot,
  isHovered,
  onHover,
}: StudyPlantsProps) {
  const leavesRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (leavesRef.current) {
      leavesRef.current.children.forEach((child, idx) => {
        child.rotation.z =
          (child.userData.baseRotZ || 0) + Math.sin(t * 0.75 + idx * 0.8) * 0.025;
      });
    }
  });

  const bigPlantLeaves = useMemo(() => {
    return [
      { rotY: 0, rotX: 0.38, rotZ: 0.18, length: 0.44, width: 0.22, y: 0.38 },
      { rotY: 1.1, rotX: 0.32, rotZ: -0.14, length: 0.48, width: 0.24, y: 0.42 },
      { rotY: 2.2, rotX: 0.42, rotZ: 0.22, length: 0.42, width: 0.2, y: 0.4 },
      { rotY: 3.4, rotX: 0.28, rotZ: -0.18, length: 0.5, width: 0.26, y: 0.46 },
      { rotY: 4.6, rotX: 0.4, rotZ: 0.16, length: 0.46, width: 0.23, y: 0.45 },
      { rotY: 0.5, rotX: 0.18, rotZ: 0.08, length: 0.38, width: 0.18, y: 0.56 },
      { rotY: 2.7, rotX: 0.2, rotZ: -0.1, length: 0.4, width: 0.2, y: 0.58 },
    ];
  }, []);

  return (
    <group position={[2.7, 0, -2.9]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelectHotspot("plant");
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
        }}
        onPointerOut={() => onHover(false)}
      >
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.45, 0.35, 1.1, 8]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {isHovered && (
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.47, 0.37, 1.12, 12]} />
            <meshBasicMaterial
              color="#a3e635"
              wireframe
              transparent
              opacity={0.65}
            />
          </mesh>
        )}

        {/* テラコッタ鉢 */}
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.18, 0.4, 16]} />
          <meshStandardMaterial color="#9c5637" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.38, 0]}>
          <cylinderGeometry args={[0.28, 0.26, 0.05, 16]} />
          <meshStandardMaterial color="#8a4a2e" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.37, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.02, 12]} />
          <meshStandardMaterial color="#2b2016" roughness={0.9} />
        </mesh>

        {/* 枝葉 */}
        <group ref={leavesRef}>
          {bigPlantLeaves.map((leaf, idx) => (
            <group
              key={idx}
              position={[0, leaf.y, 0]}
              rotation={[leaf.rotX, leaf.rotY, leaf.rotZ]}
              userData={{ baseRotZ: leaf.rotZ }}
            >
              <mesh position={[0, leaf.length * 0.4, 0]}>
                <cylinderGeometry args={[0.01, 0.014, leaf.length * 0.8, 6]} />
                <meshStandardMaterial color="#44700d" roughness={0.7} />
              </mesh>
              <mesh
                position={[0, leaf.length * 0.7, 0]}
                rotation={[Math.PI / 4, 0, 0]}
                castShadow
              >
                <planeGeometry args={[leaf.width, leaf.length * 0.6]} />
                <meshStandardMaterial
                  color="#26572a"
                  roughness={0.4}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
