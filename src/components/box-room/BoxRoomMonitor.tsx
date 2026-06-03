"use client";

import { Text } from "@react-three/drei";

import { BoxRoomPreset } from "@/components/box-room/roomPresets";

type BoxRoomMonitorProps = {
  clockLabel: string;
  isOnAir: boolean;
  preset: BoxRoomPreset;
  title: string;
};

function clampTitle(title: string) {
  return title.length > 26 ? `${title.slice(0, 25)}...` : title;
}

export function BoxRoomMonitor({
  clockLabel,
  isOnAir,
  preset,
  title,
}: BoxRoomMonitorProps) {
  return (
    <group position={[-1.05, 0.15, 0.45]} rotation={[0.08, 0.36, -0.02]}>
      <mesh castShadow receiveShadow position={[0, -0.12, -0.06]}>
        <boxGeometry args={[1.42, 0.92, 0.78]} />
        <meshStandardMaterial color="#1f2937" roughness={0.76} metalness={0.08} />
      </mesh>

      <mesh position={[0, -0.12, 0.35]}>
        <boxGeometry args={[1.16, 0.68, 0.035]} />
        <meshStandardMaterial
          color="#06130f"
          emissive={preset.monitorGlow}
          emissiveIntensity={0.58}
          roughness={0.48}
        />
      </mesh>

      <Text
        anchorX="left"
        anchorY="middle"
        color="#bbf7d0"
        fontSize={0.17}
        maxWidth={0.92}
        position={[-0.49, 0.08, 0.385]}
      >
        {clockLabel}
      </Text>
      <Text
        anchorX="left"
        anchorY="middle"
        color={isOnAir ? "#fca5a5" : "#94a3b8"}
        fontSize={0.055}
        maxWidth={0.9}
        position={[-0.49, -0.08, 0.389]}
      >
        {isOnAir ? `● ${preset.statusLabel}` : "OFF AIR"}
      </Text>
      <Text
        anchorX="left"
        anchorY="middle"
        color="#bae6fd"
        fontSize={0.046}
        maxWidth={0.9}
        position={[-0.49, -0.2, 0.389]}
      >
        {preset.subtitle}
      </Text>
      <Text
        anchorX="left"
        anchorY="top"
        color="#e2e8f0"
        fontSize={0.045}
        lineHeight={1.22}
        maxWidth={0.94}
        position={[-0.49, -0.29, 0.389]}
      >
        {clampTitle(title)}
      </Text>

      <mesh position={[0, -0.68, -0.06]}>
        <boxGeometry args={[0.52, 0.1, 0.36]} />
        <meshStandardMaterial color="#111827" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.8, 0.01]}>
        <boxGeometry args={[0.88, 0.08, 0.52]} />
        <meshStandardMaterial color="#0f172a" roughness={0.82} />
      </mesh>
      <mesh position={[0.52, -0.48, 0.38]}>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshStandardMaterial
          color="#86efac"
          emissive="#86efac"
          emissiveIntensity={0.72}
        />
      </mesh>
    </group>
  );
}
