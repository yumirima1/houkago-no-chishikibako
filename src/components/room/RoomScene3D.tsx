"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  ObservationSubject,
  SubjectAction,
} from "@/components/observation/observationTypes";

type RoomScene3DProps = {
  action: SubjectAction;
  isScreensaver: boolean;
  subject: ObservationSubject;
};

type SubjectPalette = {
  accent: string;
  avatar: string;
  lamp: string;
  monitor: string;
  wall: string;
};

function getPalette(subject: ObservationSubject): SubjectPalette {
  if (subject.id === "kana") {
    return {
      accent: "#f9a8d4",
      avatar: "#fbcfe8",
      lamp: "#fbbf77",
      monitor: "#f9a8d4",
      wall: "#111827",
    };
  }

  return {
    accent: "#67e8f9",
    avatar: "#a5f3fc",
    lamp: "#f59e0b",
    monitor: "#86efac",
    wall: "#0f172a",
  };
}

function RainPlane() {
  const drops = useMemo(
    () =>
      Array.from({ length: 36 }, (_, index) => ({
        x: -0.68 + (index % 9) * 0.17,
        y: -0.36 + Math.floor(index / 9) * 0.18,
      })),
    [],
  );

  return (
    <group position={[1.68, 0.62, -1.58]} rotation={[0, -0.08, -0.16]}>
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, 0.018]}>
          <boxGeometry args={[0.008, 0.15, 0.006]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={0.24} />
        </mesh>
      ))}
    </group>
  );
}

function RoomObjects({ action, isScreensaver, subject }: RoomScene3DProps) {
  const palette = getPalette(subject);
  const actionPulse = 0.05 + (action.id.length % 4) * 0.018;
  const roomRef = useRef<THREE.Group>(null);
  const lampRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock, pointer }) => {
    const elapsed = clock.getElapsedTime();

    if (roomRef.current) {
      roomRef.current.rotation.y =
        Math.sin(elapsed * 0.13) * 0.018 + pointer.x * 0.02;
      roomRef.current.rotation.x = pointer.y * -0.008;
    }

    if (lampRef.current) {
      lampRef.current.intensity =
        (isScreensaver ? 1.16 : 1.35) + Math.sin(elapsed * 1.4) * 0.05;
    }
  });

  return (
    <>
      <color attach="background" args={["#040814"]} />
      <fog attach="fog" args={["#040814", 4.2, 8.2]} />
      <ambientLight intensity={0.18} />
      <directionalLight color="#93c5fd" intensity={0.2} position={[2, 3, 2]} />
      <pointLight
        ref={lampRef}
        color={palette.lamp}
        decay={1.7}
        distance={4.2}
        position={[0.86, 1.05, 0.95]}
      />
      <pointLight
        color={palette.monitor}
        decay={1.5}
        distance={2.3}
        intensity={0.72}
        position={[-1.1, 0.3, 0.75]}
      />

      <group ref={roomRef}>
        <mesh receiveShadow position={[0, -0.86, -0.12]}>
          <boxGeometry args={[4.8, 0.12, 3.9]} />
          <meshStandardMaterial color="#090f1f" roughness={0.92} />
        </mesh>
        <mesh receiveShadow position={[0, 0.74, -2.04]}>
          <boxGeometry args={[4.8, 3.2, 0.1]} />
          <meshStandardMaterial color={palette.wall} roughness={0.9} />
        </mesh>
        <mesh receiveShadow position={[-2.42, 0.68, -0.12]}>
          <boxGeometry args={[0.1, 3.1, 3.9]} />
          <meshStandardMaterial color="#0b1020" roughness={0.9} />
        </mesh>

        <mesh receiveShadow position={[0, -0.34, 0.35]}>
          <boxGeometry args={[3.08, 0.18, 1.16]} />
          <meshStandardMaterial color="#342316" roughness={0.75} />
        </mesh>
        <mesh position={[-1.22, -0.75, 0.05]}>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color="#1c130d" roughness={0.8} />
        </mesh>
        <mesh position={[1.22, -0.75, 0.05]}>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color="#1c130d" roughness={0.8} />
        </mesh>

        <group position={[-1.12, 0.04, 0.54]} rotation={[0.07, 0.32, -0.02]}>
          <mesh>
            <boxGeometry args={[1.1, 0.74, 0.6]} />
            <meshStandardMaterial color="#1f2937" roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.02, 0.32]}>
            <boxGeometry args={[0.82, 0.46, 0.035]} />
            <meshStandardMaterial
              color="#06130f"
              emissive={palette.monitor}
              emissiveIntensity={0.48}
              roughness={0.5}
            />
          </mesh>
          <mesh position={[0.36, -0.22, 0.34]}>
            <sphereGeometry args={[0.025, 12, 8]} />
            <meshStandardMaterial
              color={palette.monitor}
              emissive={palette.monitor}
              emissiveIntensity={0.7}
            />
          </mesh>
        </group>

        <group position={[1.02, -0.06, 0.46]}>
          <mesh>
            <cylinderGeometry args={[0.07, 0.12, 0.62, 18]} />
            <meshStandardMaterial color="#4b3324" roughness={0.66} />
          </mesh>
          <mesh position={[0, 0.37, 0]}>
            <sphereGeometry args={[0.18, 20, 14]} />
            <meshStandardMaterial
              color="#fed7aa"
              emissive={palette.lamp}
              emissiveIntensity={0.62}
              roughness={0.34}
            />
          </mesh>
        </group>

        <group position={[1.68, 0.62, -1.98]}>
          <mesh>
            <boxGeometry args={[1.16, 0.98, 0.05]} />
            <meshStandardMaterial
              color="#0b1324"
              emissive="#172554"
              emissiveIntensity={0.24}
              roughness={0.6}
            />
          </mesh>
          <mesh position={[0, 0, 0.034]}>
            <boxGeometry args={[0.92, 0.75, 0.025]} />
            <meshBasicMaterial color="#0c1c35" transparent opacity={0.82} />
          </mesh>
          <RainPlane />
        </group>

        <group position={[-1.72, -0.16, 0.38]}>
          <mesh>
            <sphereGeometry args={[0.42, 28, 18]} />
            <meshStandardMaterial
              color={palette.avatar}
              emissive={palette.accent}
              emissiveIntensity={0.08}
              roughness={0.72}
            />
          </mesh>
          <mesh position={[0.08, 0.5, 0]}>
            <sphereGeometry args={[0.2, 18, 12]} />
            <meshStandardMaterial color={palette.avatar} roughness={0.68} />
          </mesh>
        </group>

        <mesh position={[0.15, -0.18, 0.48]} rotation={[0.02, -0.14, 0]}>
          <boxGeometry args={[0.52, 0.035, 0.32]} />
          <meshStandardMaterial
            color="#334155"
            emissive={palette.accent}
            emissiveIntensity={actionPulse}
            roughness={0.8}
          />
        </mesh>
        <mesh position={[0.62, -0.2, 0.45]}>
          <boxGeometry args={[0.34, 0.04, 0.28]} />
          <meshStandardMaterial color="#111827" roughness={0.82} />
        </mesh>
        <mesh position={[1.23, -0.19, 0.08]}>
          <boxGeometry args={[0.42, 0.22, 0.32]} />
          <meshStandardMaterial
            color="#1e293b"
            emissive={palette.accent}
            emissiveIntensity={0.05}
            roughness={0.76}
          />
        </mesh>
      </group>

      <group position={[-1.75, 1.18, -1.78]}>
        <mesh>
          <boxGeometry args={[1.18, 0.18, 0.04]} />
          <meshStandardMaterial
            color="#111827"
            emissive={palette.accent}
            emissiveIntensity={0.12}
            roughness={0.55}
          />
        </mesh>
      </group>
    </>
  );
}

export default function RoomScene3D(props: RoomScene3DProps) {
  return (
    <Canvas
      camera={{ fov: 46, position: [0, 1.1, 4.45] }}
      className="room-scene-3d-canvas"
      dpr={[1, 1.25]}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: true,
      }}
      onCreated={({ camera }) => camera.lookAt(0, 0.12, 0)}
      shadows={false}
    >
      <RoomObjects {...props} />
    </Canvas>
  );
}
