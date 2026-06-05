"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  ObservationSubject,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";

type RoomScene3DProps = {
  action: SubjectAction;
  activeObjectId?: RoomObjectId | null;
  isScreensaver: boolean;
  subject: ObservationSubject;
};

type SubjectPalette = {
  accent: string;
  avatar: string;
  ambient: number;
  lampIntensity: number;
  lamp: string;
  monitor: string;
  sky: string;
  wall: string;
  windowGlow: string;
};

function getTimePhase() {
  const hour = Number(
    new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Tokyo",
    }).format(new Date()),
  );

  if (hour >= 5 && hour < 17) {
    return "morning";
  }

  if (hour >= 17 && hour < 22) {
    return "evening";
  }

  if (hour >= 0 && hour < 4) {
    return "deep-night";
  }

  return "night";
}

function getPalette(subject: ObservationSubject): SubjectPalette {
  const phase = getTimePhase();
  const isMorning = phase === "morning";
  const isEvening = phase === "evening";
  const isDeepNight = phase === "deep-night";

  if (subject.id === "kana") {
    return {
      accent: "#f9a8d4",
      ambient: isMorning ? 0.24 : isEvening ? 0.2 : isDeepNight ? 0.12 : 0.16,
      avatar: "#fbcfe8",
      lamp: isMorning ? "#fdecc8" : "#fbbf77",
      lampIntensity: isDeepNight ? 1.42 : 1.24,
      monitor: "#f9a8d4",
      sky: isMorning ? "#0d1b2a" : isEvening ? "#160d18" : "#040814",
      wall: isMorning ? "#162033" : "#111827",
      windowGlow: isMorning ? "#bfdbfe" : isEvening ? "#f9a8d4" : "#93c5fd",
    };
  }

  return {
    accent: "#67e8f9",
    ambient: isMorning ? 0.25 : isEvening ? 0.18 : isDeepNight ? 0.11 : 0.15,
    avatar: "#a5f3fc",
    lamp: isMorning ? "#fde68a" : "#f59e0b",
    lampIntensity: isDeepNight ? 1.5 : 1.32,
    monitor: "#86efac",
    sky: isMorning ? "#0b1b2d" : isEvening ? "#120c15" : "#040814",
    wall: isMorning ? "#172033" : "#0f172a",
    windowGlow: isMorning ? "#bae6fd" : isEvening ? "#fbbf77" : "#93c5fd",
  };
}

function RainLayer({
  count,
  opacity,
  speed,
  width,
}: {
  count: number;
  opacity: number;
  speed: number;
  width: number;
}) {
  const rainRef = useRef<THREE.Group>(null);
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        x: -0.72 + (index % 9) * 0.18,
        y: -0.42 + Math.floor(index / 9) * 0.18,
      })),
    [count],
  );

  useFrame(({ clock }) => {
    if (!rainRef.current) {
      return;
    }

    rainRef.current.position.y = -((clock.elapsedTime * speed) % 0.34);
  });

  return (
    <group ref={rainRef} rotation={[0, -0.08, -0.16]}>
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, 0.018]}>
          <boxGeometry args={[width, 0.12 + width * 7, 0.006]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

function RainWindow() {
  return (
    <group position={[1.68, 0.62, -1.58]}>
      <RainLayer count={28} opacity={0.2} speed={0.06} width={0.006} />
      <RainLayer count={20} opacity={0.28} speed={0.11} width={0.009} />
      <RainLayer count={14} opacity={0.35} speed={0.16} width={0.012} />
      <mesh position={[0, -0.02, 0.026]}>
        <boxGeometry args={[0.96, 0.78, 0.012]} />
        <meshBasicMaterial color="#bfdbfe" transparent opacity={0.035} />
      </mesh>
    </group>
  );
}

function DustParticles({ color }: { color: string }) {
  const particleRef = useRef<THREE.Group>(null);
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => ({
        x: -1.9 + (index % 7) * 0.62,
        y: -0.3 + Math.floor(index / 7) * 0.42,
        z: -0.8 + (index % 4) * 0.34,
      })),
    [],
  );

  useFrame(({ clock }) => {
    if (!particleRef.current) {
      return;
    }

    particleRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.08;
  });

  return (
    <group ref={particleRef}>
      {particles.map((particle, index) => (
        <mesh key={index} position={[particle.x, particle.y, particle.z]}>
          <sphereGeometry args={[0.008, 8, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} />
        </mesh>
      ))}
    </group>
  );
}

function ClockFace({ accent }: { accent: string }) {
  const handRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!handRef.current) {
      return;
    }

    const seconds = new Date().getSeconds();
    handRef.current.rotation.z = -((seconds / 60) * Math.PI * 2);
  });

  return (
    <group position={[1.1, 1.17, -2.05]}>
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 0.025, 32]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={0.08}
          roughness={0.62}
        />
      </mesh>
      <mesh ref={handRef} position={[0, 0, 0.021]}>
        <boxGeometry args={[0.012, 0.14, 0.01]} />
        <meshBasicMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}

function OnAirSign({ accent }: { accent: string }) {
  const signRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (!signRef.current) {
      return;
    }

    signRef.current.emissiveIntensity =
      0.2 + Math.max(0, Math.sin(clock.elapsedTime * 2.4)) * 0.42;
  });

  return (
    <group position={[-1.42, 1.2, -2.05]}>
      <mesh>
        <boxGeometry args={[0.84, 0.2, 0.045]} />
        <meshStandardMaterial
          ref={signRef}
          color="#300b12"
          emissive="#ef4444"
          emissiveIntensity={0.3}
          roughness={0.48}
        />
      </mesh>
      <mesh position={[0.34, 0, 0.035]}>
        <sphereGeometry args={[0.035, 14, 10]} />
        <meshBasicMaterial color={accent} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function getObjectGlow(activeObjectId?: RoomObjectId | null) {
  return activeObjectId ? 0.28 : 0;
}

function TartarRoomObjects({
  accent,
  activeObjectId,
}: {
  accent: string;
  activeObjectId?: RoomObjectId | null;
}) {
  const glow = getObjectGlow(activeObjectId);

  return (
    <group>
      <mesh position={[-0.22, -0.18, 0.52]} rotation={[0.02, -0.14, 0]}>
        <boxGeometry args={[0.56, 0.035, 0.34]} />
        <meshStandardMaterial
          color="#334155"
          emissive={accent}
          emissiveIntensity={0.09 + (activeObjectId === "memo" ? glow : 0)}
          roughness={0.8}
        />
      </mesh>
      <mesh position={[0.38, -0.18, 0.48]}>
        <boxGeometry args={[0.42, 0.04, 0.3]} />
        <meshStandardMaterial color="#111827" roughness={0.82} />
      </mesh>
      <mesh position={[1.23, -0.19, 0.08]}>
        <boxGeometry args={[0.42, 0.22, 0.32]} />
        <meshStandardMaterial
          color="#1e293b"
          emissive={accent}
          emissiveIntensity={
            0.05 + (activeObjectId === "terminal" ? glow : 0)
          }
          roughness={0.76}
        />
      </mesh>
      {[-0.6, -0.48, -0.36, -0.24].map((x, index) => (
        <mesh key={index} position={[x, -0.09 - index * 0.025, 0.88]}>
          <torusGeometry args={[0.22, 0.006, 6, 28, Math.PI]} />
          <meshBasicMaterial color={accent} transparent opacity={0.3} />
        </mesh>
      ))}
      <mesh position={[-1.62, -0.28, 0.12]}>
        <boxGeometry args={[0.24, 0.32, 0.28]} />
        <meshStandardMaterial
          color="#111827"
          emissive={accent}
          emissiveIntensity={activeObjectId === "crt" ? glow : 0}
          roughness={0.62}
        />
      </mesh>
      <mesh position={[-1.28, -0.28, 0.12]}>
        <boxGeometry args={[0.24, 0.32, 0.28]} />
        <meshStandardMaterial
          color="#111827"
          emissive={accent}
          emissiveIntensity={activeObjectId === "envelope" ? glow : 0}
          roughness={0.62}
        />
      </mesh>
    </group>
  );
}

function KanaRoomObjects({
  accent,
  activeObjectId,
}: {
  accent: string;
  activeObjectId?: RoomObjectId | null;
}) {
  const glow = getObjectGlow(activeObjectId);

  return (
    <group>
      <group position={[-1.42, 0.02, 0.1]}>
        <mesh>
          <boxGeometry args={[0.72, 0.82, 0.16]} />
          <meshStandardMaterial color="#261a18" roughness={0.78} />
        </mesh>
        {Array.from({ length: 7 }, (_, index) => (
          <mesh
            key={index}
            position={[-0.27 + index * 0.09, 0.02, 0.1]}
            rotation={[0, 0, index % 2 ? 0.04 : -0.03]}
          >
            <boxGeometry args={[0.055, 0.54, 0.12]} />
            <meshStandardMaterial
              color={index % 2 ? "#7f1d1d" : "#334155"}
              emissive={accent}
              emissiveIntensity={activeObjectId === "memo" ? glow * 0.35 : 0}
              roughness={0.7}
            />
          </mesh>
        ))}
      </group>
      <mesh position={[0.12, -0.18, 0.52]} rotation={[0.02, -0.12, 0]}>
        <boxGeometry args={[0.54, 0.035, 0.34]} />
        <meshStandardMaterial
          color="#4b2b38"
          emissive={accent}
          emissiveIntensity={0.05 + (activeObjectId === "memo" ? glow : 0)}
          roughness={0.78}
        />
      </mesh>
      <mesh position={[0.7, -0.18, 0.48]}>
        <boxGeometry args={[0.22, 0.035, 0.34]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={0.08 + (activeObjectId === "terminal" ? glow : 0)}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[1.18, -0.2, 0.12]}>
        <cylinderGeometry args={[0.15, 0.15, 0.16, 22]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive={accent}
          emissiveIntensity={0.08 + (activeObjectId === "crt" ? glow : 0)}
          roughness={0.64}
        />
      </mesh>
    </group>
  );
}

function RoomObjects({
  action,
  activeObjectId,
  isScreensaver,
  subject,
}: RoomScene3DProps) {
  const palette = getPalette(subject);
  const actionPulse = 0.05 + (action.id.length % 4) * 0.018;
  const activeGlow = getObjectGlow(activeObjectId);
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
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.sky, 4.2, 8.2]} />
      <ambientLight intensity={palette.ambient} />
      <directionalLight
        color={palette.windowGlow}
        intensity={0.22 + (activeObjectId === "window" ? activeGlow : 0)}
        position={[2, 3, 2]}
      />
      <pointLight
        ref={lampRef}
        color={palette.lamp}
        decay={1.7}
        distance={4.2}
        intensity={
          palette.lampIntensity + (activeObjectId === "lamp" ? activeGlow : 0)
        }
        position={[0.86, 1.05, 0.95]}
      />
      <pointLight
        color={palette.monitor}
        decay={1.5}
        distance={2.3}
        intensity={
          0.72 +
          (activeObjectId === "crt" || activeObjectId === "terminal"
            ? activeGlow
            : 0)
        }
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
              emissiveIntensity={
                0.48 +
                actionPulse +
                (activeObjectId === "crt" ? activeGlow : 0)
              }
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
              emissiveIntensity={
                0.62 + (activeObjectId === "lamp" ? activeGlow : 0)
              }
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
          <RainWindow />
        </group>

        <ClockFace accent={palette.accent} />
        <OnAirSign accent={palette.accent} />

        <group position={[-1.72, -0.16, 0.38]}>
          <mesh>
            <sphereGeometry args={[0.42, 28, 18]} />
            <meshStandardMaterial
              color={palette.avatar}
              emissive={palette.accent}
              emissiveIntensity={0.08 + actionPulse}
              roughness={0.72}
            />
          </mesh>
          <mesh position={[0.08, 0.5, 0]}>
            <sphereGeometry args={[0.2, 18, 12]} />
            <meshStandardMaterial color={palette.avatar} roughness={0.68} />
          </mesh>
        </group>

        {subject.id === "tartar" ? (
          <TartarRoomObjects
            accent={palette.accent}
            activeObjectId={activeObjectId}
          />
        ) : (
          <KanaRoomObjects
            accent={palette.accent}
            activeObjectId={activeObjectId}
          />
        )}
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
      <DustParticles color={palette.accent} />
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
