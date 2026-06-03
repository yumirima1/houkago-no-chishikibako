"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { BoxRoomCamera } from "@/components/box-room/BoxRoomCamera";
import { BoxRoomMonitor } from "@/components/box-room/BoxRoomMonitor";
import {
  BoxRoomLightingPhase,
  BoxRoomPresetId,
  roomPresets,
} from "@/components/box-room/roomPresets";

type BoxRoomSceneProps = {
  clockLabel: string;
  isOnAir: boolean;
  lightingPhase: BoxRoomLightingPhase;
  mode?: BoxRoomPresetId;
  title: string;
};

function getLighting(phase: BoxRoomLightingPhase) {
  if (phase === "morning") {
    return {
      ambient: 0.32,
      lamp: "#f8d49b",
      moon: "#b6d8ff",
      sky: "#0b1420",
      windowGlow: 0.32,
    };
  }

  if (phase === "evening") {
    return {
      ambient: 0.22,
      lamp: "#fbbf77",
      moon: "#f7c58f",
      sky: "#120c15",
      windowGlow: 0.24,
    };
  }

  return {
    ambient: 0.15,
    lamp: "#f59e0b",
    moon: "#93c5fd",
    sky: "#050812",
    windowGlow: 0.18,
  };
}

function RainLines() {
  const drops = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => ({
        x: -0.55 + (index % 9) * 0.14,
        y: 0.18 + Math.floor(index / 9) * 0.22,
      })),
    [],
  );

  return (
    <group position={[1.92, 0.75, -1.86]} rotation={[0, -0.04, -0.17]}>
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, 0.025]}>
          <boxGeometry args={[0.008, 0.16, 0.006]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={0.28} />
        </mesh>
      ))}
    </group>
  );
}

function Steam() {
  const steamRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!steamRef.current) {
      return;
    }

    steamRef.current.position.y = 0.56 + Math.sin(clock.elapsedTime * 1.2) * 0.03;
    steamRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.64) * 0.08;
  });

  return (
    <group ref={steamRef} position={[0.72, 0.56, 0.48]}>
      {[0, 1, 2].map((item) => (
        <mesh key={item} position={[item * 0.08, item * 0.04, 0]}>
          <torusGeometry args={[0.06 + item * 0.02, 0.004, 8, 24]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.18} />
        </mesh>
      ))}
    </group>
  );
}

function RoomObjects({
  clockLabel,
  isOnAir,
  lightingPhase,
  mode = "knowledge",
  title,
}: BoxRoomSceneProps) {
  const preset = roomPresets[mode];
  const lighting = getLighting(lightingPhase);
  const roomRef = useRef<THREE.Group>(null);

  useFrame(({ clock, pointer }) => {
    if (!roomRef.current) {
      return;
    }

    roomRef.current.rotation.y =
      Math.sin(clock.elapsedTime * 0.11) * 0.012 + pointer.x * 0.018;
    roomRef.current.rotation.x = pointer.y * -0.006;
  });

  return (
    <>
      <color attach="background" args={[lighting.sky]} />
      <fog attach="fog" args={[lighting.sky, 4.6, 9.2]} />
      <ambientLight intensity={lighting.ambient} />
      <directionalLight
        color={lighting.moon}
        intensity={lighting.windowGlow}
        position={[2.8, 3.4, 2.2]}
      />
      <pointLight
        color={lighting.lamp}
        decay={1.8}
        distance={4.4}
        intensity={1.55}
        position={[0.95, 1.25, 1.1]}
      />
      <pointLight
        color={preset.monitorGlow}
        decay={1.8}
        distance={2.4}
        intensity={0.85}
        position={[-1.12, 0.34, 0.9]}
      />

      <group ref={roomRef}>
        <mesh receiveShadow position={[0, -0.92, -0.15]}>
          <boxGeometry args={[5.2, 0.12, 4.2]} />
          <meshStandardMaterial color="#0b1020" roughness={0.9} />
        </mesh>
        <mesh receiveShadow position={[0, 0.78, -2.18]}>
          <boxGeometry args={[5.2, 3.4, 0.12]} />
          <meshStandardMaterial color="#111827" roughness={0.86} />
        </mesh>
        <mesh receiveShadow position={[-2.62, 0.74, -0.15]}>
          <boxGeometry args={[0.12, 3.3, 4.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.9} />
        </mesh>

        <mesh receiveShadow position={[0, -0.35, 0.38]}>
          <boxGeometry args={[3.15, 0.18, 1.28]} />
          <meshStandardMaterial color="#3a261b" roughness={0.72} />
        </mesh>
        <mesh position={[-1.32, -0.78, -0.02]}>
          <boxGeometry args={[0.12, 0.82, 0.12]} />
          <meshStandardMaterial color="#21170f" roughness={0.76} />
        </mesh>
        <mesh position={[1.32, -0.78, -0.02]}>
          <boxGeometry args={[0.12, 0.82, 0.12]} />
          <meshStandardMaterial color="#21170f" roughness={0.76} />
        </mesh>

        <BoxRoomMonitor
          clockLabel={clockLabel}
          isOnAir={isOnAir}
          preset={preset}
          title={title}
        />

        <group position={[1.02, 0.04, 0.34]}>
          <mesh>
            <cylinderGeometry args={[0.08, 0.12, 0.72, 18]} />
            <meshStandardMaterial color="#4b3324" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <sphereGeometry args={[0.18, 24, 16]} />
            <meshStandardMaterial
              color="#fed7aa"
              emissive={lighting.lamp}
              emissiveIntensity={0.58}
              roughness={0.32}
            />
          </mesh>
        </group>

        <group position={[1.8, 0.76, -2.09]}>
          <mesh>
            <boxGeometry args={[1.28, 1.08, 0.05]} />
            <meshStandardMaterial
              color="#0b1324"
              emissive="#172554"
              emissiveIntensity={0.3}
              roughness={0.58}
            />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[1.03, 0.82, 0.025]} />
            <meshBasicMaterial color="#0c1c35" transparent opacity={0.82} />
          </mesh>
          <RainLines />
        </group>

        <Float floatIntensity={0.08} rotationIntensity={0.05} speed={1.1}>
          <group position={[0.72, -0.16, 0.46]}>
            <mesh>
              <cylinderGeometry args={[0.13, 0.1, 0.22, 24]} />
              <meshStandardMaterial color="#172033" roughness={0.62} />
            </mesh>
            <Steam />
          </group>
        </Float>

        <group position={[0.04, -0.2, 0.52]} rotation={[0.02, -0.16, 0]}>
          <mesh>
            <boxGeometry args={[0.54, 0.035, 0.34]} />
            <meshStandardMaterial color="#1e293b" roughness={0.8} />
          </mesh>
          <mesh position={[0.02, 0.026, 0.02]}>
            <boxGeometry args={[0.48, 0.012, 0.28]} />
            <meshStandardMaterial color="#334155" roughness={0.76} />
          </mesh>
        </group>

        <group position={[1.08, 1.22, -2.1]}>
          <mesh>
            <boxGeometry args={[0.72, 0.22, 0.04]} />
            <meshStandardMaterial
              color={isOnAir ? "#450a0a" : "#111827"}
              emissive={isOnAir ? "#ef4444" : "#020617"}
              emissiveIntensity={isOnAir ? 0.78 : 0.1}
              roughness={0.42}
            />
          </mesh>
          <Text
            anchorX="center"
            anchorY="middle"
            color={isOnAir ? "#fecaca" : "#64748b"}
            fontSize={0.07}
            position={[0, 0, 0.031]}
          >
            {isOnAir ? "ON AIR" : "OFF AIR"}
          </Text>
        </group>
      </group>

      <BoxRoomCamera />
    </>
  );
}

export default function BoxRoomScene(props: BoxRoomSceneProps) {
  return (
    <Canvas
      camera={{ fov: 44, position: [0, 1.28, 4.85] }}
      className="box-room-canvas"
      dpr={[1, 1.45]}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      }}
      shadows={false}
    >
      <RoomObjects {...props} />
    </Canvas>
  );
}
