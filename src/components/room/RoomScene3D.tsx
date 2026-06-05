"use client";

import { Html } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import {
  BroadcastThemeCandidate,
  ObservationLog,
  ObservationSubject,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";
import { Episode, getEpisodeNumberLabel } from "@/data/episodes";

type RoomScene3DProps = {
  action: SubjectAction;
  activeObjectId?: RoomObjectId | null;
  broadcastCandidates: BroadcastThemeCandidate[];
  isPlaying: boolean;
  isScreensaver: boolean;
  latestEpisode: Episode;
  logs: ObservationLog[];
  onInspectObject: (objectId: RoomObjectId) => void;
  subject: ObservationSubject;
  timeStateLabel: string;
};

type SubjectPalette = {
  accent: string;
  ambient: number;
  avatar: string;
  lamp: string;
  lampIntensity: number;
  monitor: string;
  sky: string;
  wall: string;
  windowGlow: string;
};

type CameraTarget = {
  lookAt: [number, number, number];
  position: [number, number, number];
};

const cameraTargets: Record<RoomObjectId | "idle", CameraTarget> = {
  idle: {
    lookAt: [-0.12, 0.12, -0.28],
    position: [0.5, 1.36, 5.15],
  },
  clock: {
    lookAt: [1.08, 1.16, -2],
    position: [0.62, 1.42, 2.74],
  },
  crt: {
    lookAt: [-1.12, 0.04, 0.84],
    position: [-0.74, 0.54, 2.62],
  },
  envelope: {
    lookAt: [-1.3, 0.9, -1.5],
    position: [-0.82, 1.1, 2.7],
  },
  lamp: {
    lookAt: [1.02, 0.24, 0.48],
    position: [0.72, 0.68, 2.48],
  },
  memo: {
    lookAt: [-0.1, -0.25, 0.58],
    position: [0.02, 0.22, 2.14],
  },
  radio: {
    lookAt: [1.24, -0.13, 0.22],
    position: [0.82, 0.36, 2.42],
  },
  terminal: {
    lookAt: [0.66, -0.02, 0.6],
    position: [0.54, 0.46, 2.36],
  },
  window: {
    lookAt: [1.62, 0.62, -1.82],
    position: [1.18, 0.96, 2.16],
  },
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
      ambient: isMorning ? 0.18 : isEvening ? 0.15 : isDeepNight ? 0.075 : 0.1,
      avatar: "#fbcfe8",
      lamp: isMorning ? "#fdecc8" : "#f59e85",
      lampIntensity: isDeepNight ? 1.38 : 1.18,
      monitor: "#f9a8d4",
      sky: isMorning ? "#0b1528" : isEvening ? "#120a16" : "#030712",
      wall: isMorning ? "#121b2d" : "#0b1020",
      windowGlow: isMorning ? "#bfdbfe" : isEvening ? "#f9a8d4" : "#7dd3fc",
    };
  }

  return {
    accent: "#67e8f9",
    ambient: isMorning ? 0.18 : isEvening ? 0.13 : isDeepNight ? 0.065 : 0.09,
    avatar: "#a5f3fc",
    lamp: isMorning ? "#fde68a" : "#f59e0b",
    lampIntensity: isDeepNight ? 1.46 : 1.24,
    monitor: "#86efac",
    sky: isMorning ? "#0a172a" : isEvening ? "#100a15" : "#030712",
    wall: isMorning ? "#111b2d" : "#070d1d",
    windowGlow: isMorning ? "#bae6fd" : isEvening ? "#fbbf77" : "#7dd3fc",
  };
}

function CameraRig({ activeObjectId }: { activeObjectId?: RoomObjectId | null }) {
  const lookAtRef = useRef(new THREE.Vector3(...cameraTargets.idle.lookAt));
  const positionRef = useRef(new THREE.Vector3(...cameraTargets.idle.position));
  const nextLookAt = useRef(new THREE.Vector3());
  const nextPosition = useRef(new THREE.Vector3());

  useFrame(({ camera, clock, pointer }) => {
    const target = cameraTargets[activeObjectId ?? "idle"] ?? cameraTargets.idle;
    const selected = Boolean(activeObjectId);
    const breathe = Math.sin(clock.elapsedTime * 0.38) * 0.018;

    nextPosition.current
      .set(...target.position)
      .add(new THREE.Vector3(pointer.x * 0.08, pointer.y * 0.045 + breathe, 0));
    nextLookAt.current
      .set(...target.lookAt)
      .add(new THREE.Vector3(pointer.x * 0.055, pointer.y * 0.025, 0));

    positionRef.current.lerp(nextPosition.current, selected ? 0.045 : 0.026);
    lookAtRef.current.lerp(nextLookAt.current, selected ? 0.055 : 0.03);
    camera.position.copy(positionRef.current);
    camera.lookAt(lookAtRef.current);
  });

  return null;
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
        x: -0.52 + (index % 8) * 0.15,
        y: -0.38 + Math.floor(index / 8) * 0.16,
      })),
    [count],
  );

  useFrame(({ clock }) => {
    if (rainRef.current) {
      rainRef.current.position.y = -((clock.elapsedTime * speed) % 0.32);
    }
  });

  return (
    <group ref={rainRef} rotation={[0, -0.08, -0.18]}>
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, 0.025]}>
          <boxGeometry args={[width, 0.11 + width * 7, 0.006]} />
          <meshBasicMaterial color="#bfdbfe" transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

function RainWindow({ active }: { active: boolean }) {
  return (
    <group position={[1.68, 0.62, -1.58]}>
      <RainLayer count={26} opacity={active ? 0.32 : 0.18} speed={0.055} width={0.005} />
      <RainLayer count={18} opacity={active ? 0.4 : 0.26} speed={0.1} width={0.009} />
      <RainLayer count={12} opacity={active ? 0.5 : 0.32} speed={0.16} width={0.012} />
      <mesh position={[0, -0.02, 0.03]}>
        <boxGeometry args={[0.98, 0.8, 0.014]} />
        <meshBasicMaterial color="#dbeafe" transparent opacity={active ? 0.07 : 0.038} />
      </mesh>
    </group>
  );
}

function DustParticles({ color }: { color: string }) {
  const particleRef = useRef<THREE.Group>(null);
  const particles = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        x: -1.9 + (index % 7) * 0.62,
        y: -0.32 + Math.floor(index / 7) * 0.34,
        z: -0.96 + (index % 5) * 0.34,
      })),
    [],
  );

  useFrame(({ clock }) => {
    if (particleRef.current) {
      particleRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.07) * 0.075;
      particleRef.current.position.y = Math.sin(clock.elapsedTime * 0.18) * 0.018;
    }
  });

  return (
    <group ref={particleRef}>
      {particles.map((particle, index) => (
        <mesh key={index} position={[particle.x, particle.y, particle.z]}>
          <sphereGeometry args={[0.006 + (index % 3) * 0.002, 8, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} />
        </mesh>
      ))}
    </group>
  );
}

function ClockFace({
  accent,
  active,
  onInspectObject,
}: {
  accent: string;
  active: boolean;
  onInspectObject: (objectId: RoomObjectId) => void;
}) {
  const handRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (handRef.current) {
      const seconds = new Date().getSeconds();
      handRef.current.rotation.z = -((seconds / 60) * Math.PI * 2);
    }
  });

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onInspectObject("clock");
      }}
      position={[1.1, 1.17, -2.05]}
    >
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 0.025, 32]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={active ? 0.34 : 0.1}
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

function OnAirSign({ accent, active }: { accent: string; active: boolean }) {
  const signRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    if (signRef.current) {
      signRef.current.emissiveIntensity =
        (active ? 0.36 : 0.18) + Math.max(0, Math.sin(clock.elapsedTime * 2.4)) * 0.34;
    }
  });

  return (
    <group position={[-1.42, 1.2, -2.05]}>
      <mesh>
        <boxGeometry args={[0.84, 0.2, 0.045]} />
        <meshStandardMaterial
          ref={signRef}
          color="#230712"
          emissive="#ef4444"
          emissiveIntensity={0.24}
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

function SceneHtml({
  children,
  className,
  position,
  rotation,
}: {
  children: ReactNode;
  className: string;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <Html
      className={`room-scene-html ${className}`}
      distanceFactor={1.18}
      position={position}
      rotation={rotation}
      transform
    >
      {children}
    </Html>
  );
}

function CrtReadout({
  active,
  episode,
  isPlaying,
}: {
  active: boolean;
  episode: Episode;
  isPlaying: boolean;
}) {
  return (
    <SceneHtml
      className={active ? "is-active scene-crt-readout" : "scene-crt-readout"}
      position={[-1.12, 0.08, 0.88]}
      rotation={[0.07, 0.32, -0.02]}
    >
      <div>
        <span>{isPlaying ? "ON AIR" : "NOW READY"}</span>
        <strong>
          {getEpisodeNumberLabel(episode)} {episode.title}
        </strong>
        <small>CRTに触れると放送室が開く</small>
      </div>
    </SceneHtml>
  );
}

function TerminalReadout({
  active,
  candidate,
  latestLog,
}: {
  active: boolean;
  candidate?: BroadcastThemeCandidate;
  latestLog?: ObservationLog;
}) {
  if (!active) {
    return null;
  }

  return (
    <SceneHtml
      className="is-active scene-terminal-readout"
      position={[0.62, 0.04, 0.82]}
      rotation={[0.02, -0.12, 0]}
    >
      <div>
        <span>OBSERVATION LOG</span>
        <strong>{latestLog?.logText ?? latestLog?.thought ?? "まだ何も残っていない"}</strong>
        <small>{candidate ? `themeCandidate: ${candidate.theme}` : "触ったものが候補履歴になる"}</small>
      </div>
    </SceneHtml>
  );
}

function MemoReadout({
  active,
  action,
  candidate,
}: {
  active: boolean;
  action: SubjectAction;
  candidate?: BroadcastThemeCandidate;
}) {
  if (!active) {
    return null;
  }

  return (
    <SceneHtml
      className="is-active scene-memo-readout"
      position={[-0.04, -0.11, 0.82]}
      rotation={[1.1, 0, -0.08]}
    >
      <div>
        <span>書きかけ</span>
        <strong>{action.thought}</strong>
        <small>broadcastHint: {candidate?.hint ?? action.broadcastHint}</small>
      </div>
    </SceneHtml>
  );
}

function WindowReadout({
  active,
  timeStateLabel,
}: {
  active: boolean;
  timeStateLabel: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <SceneHtml
      className="is-active scene-window-readout"
      position={[1.46, 0.65, -1.5]}
      rotation={[0, -0.08, 0]}
    >
      <div>
        <span>雨 / {timeStateLabel}</span>
        <strong>背景モード</strong>
        <small>窓の外光と雨筋が部屋の明るさを少し変える</small>
      </div>
    </SceneHtml>
  );
}

function RadioReadout({
  active,
  episode,
  isPlaying,
}: {
  active: boolean;
  episode: Episode;
  isPlaying: boolean;
}) {
  if (!active) {
    return null;
  }

  return (
    <SceneHtml
      className="is-active scene-radio-readout"
      position={[1.24, 0.08, 0.43]}
      rotation={[0.05, -0.18, 0]}
    >
      <div>
        <span>{isPlaying ? "再生中" : "待機中"}</span>
        <strong>{episode.title}</strong>
        <small>次の放送は部屋の奥で待っている</small>
      </div>
    </SceneHtml>
  );
}

function ClockReadout({
  active,
  timeStateLabel,
}: {
  active: boolean;
  timeStateLabel: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <SceneHtml
      className="is-active scene-clock-readout"
      position={[0.82, 1.14, -1.52]}
      rotation={[0, 0, 0]}
    >
      <div>
        <span>現実時刻同期</span>
        <strong>{timeStateLabel}</strong>
        <small>時間に合わせて窓の色と光量が少し変わる</small>
      </div>
    </SceneHtml>
  );
}

function DeskClutter({
  accent,
  activeMemo,
  onInspectObject,
  subject,
}: {
  accent: string;
  activeMemo: boolean;
  onInspectObject: (objectId: RoomObjectId) => void;
  subject: ObservationSubject;
}) {
  const paperColor = subject.id === "kana" ? "#f6d8b8" : "#d7c594";

  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("memo");
        }}
        position={[-0.18, -0.22, 0.58]}
        rotation={[0.04, -0.18, -0.11]}
      >
        <boxGeometry args={[0.42, 0.012, 0.28]} />
        <meshStandardMaterial
          color={paperColor}
          emissive={accent}
          emissiveIntensity={activeMemo ? 0.2 : 0.035}
          roughness={0.86}
        />
      </mesh>
      <mesh position={[0.16, -0.21, 0.7]} rotation={[0, 0.1, 0.18]}>
        <boxGeometry args={[0.2, 0.009, 0.13]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.9} />
      </mesh>
      <mesh position={[0.34, -0.19, 0.54]} rotation={[0, 0, -0.38]}>
        <cylinderGeometry args={[0.012, 0.012, 0.42, 10]} />
        <meshStandardMaterial color="#0f172a" emissive={accent} emissiveIntensity={0.04} />
      </mesh>
      <mesh position={[0.62, -0.17, 0.28]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.085, 0.085, 0.16, 22]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <mesh position={[0.64, -0.06, 0.28]}>
        <torusGeometry args={[0.07, 0.008, 6, 18]} />
        <meshStandardMaterial color="#334155" roughness={0.78} />
      </mesh>
      {subject.id === "tartar"
        ? [-0.58, -0.48, -0.38, -0.28].map((x, index) => (
            <mesh key={index} position={[x, -0.12 - index * 0.02, 0.86]}>
              <torusGeometry args={[0.2, 0.005, 6, 28, Math.PI]} />
              <meshBasicMaterial color={accent} transparent opacity={0.28} />
            </mesh>
          ))
        : null}
    </group>
  );
}

function TartarExtras({
  accent,
  activeObjectId,
  onInspectObject,
}: {
  accent: string;
  activeObjectId?: RoomObjectId | null;
  onInspectObject: (objectId: RoomObjectId) => void;
}) {
  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("terminal");
        }}
        position={[0.66, -0.07, 0.58]}
        rotation={[0.04, -0.16, 0]}
      >
        <boxGeometry args={[0.52, 0.32, 0.055]} />
        <meshStandardMaterial
          color="#07111f"
          emissive={accent}
          emissiveIntensity={activeObjectId === "terminal" ? 0.42 : 0.16}
          roughness={0.56}
        />
      </mesh>
      <mesh position={[0.66, -0.28, 0.45]}>
        <boxGeometry args={[0.58, 0.035, 0.3]} />
        <meshStandardMaterial color="#111827" roughness={0.82} />
      </mesh>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("radio");
        }}
        position={[1.24, -0.18, 0.16]}
      >
        <boxGeometry args={[0.4, 0.2, 0.28]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive="#ef4444"
          emissiveIntensity={activeObjectId === "radio" ? 0.24 : 0.08}
          roughness={0.64}
        />
      </mesh>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("envelope");
        }}
        position={[-1.48, 1.2, -2.0]}
      >
        <sphereGeometry args={[0.045, 14, 10]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={activeObjectId === "envelope" ? 0.74 : 0.32}
        />
      </mesh>
    </group>
  );
}

function KanaExtras({
  accent,
  activeObjectId,
  onInspectObject,
}: {
  accent: string;
  activeObjectId?: RoomObjectId | null;
  onInspectObject: (objectId: RoomObjectId) => void;
}) {
  return (
    <group>
      <group
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("envelope");
        }}
        position={[-1.42, 0.02, 0.08]}
      >
        <mesh>
          <boxGeometry args={[0.72, 0.82, 0.16]} />
          <meshStandardMaterial color="#241817" roughness={0.78} />
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
              emissiveIntensity={activeObjectId === "envelope" ? 0.08 : 0}
              roughness={0.7}
            />
          </mesh>
        ))}
      </group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("terminal");
        }}
        position={[0.68, -0.17, 0.48]}
        rotation={[0.04, -0.18, 0]}
      >
        <boxGeometry args={[0.18, 0.34, 0.04]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={activeObjectId === "terminal" ? 0.38 : 0.12}
          roughness={0.72}
        />
      </mesh>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("radio");
        }}
        position={[1.18, -0.2, 0.12]}
      >
        <cylinderGeometry args={[0.15, 0.15, 0.16, 22]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive={accent}
          emissiveIntensity={activeObjectId === "radio" ? 0.28 : 0.1}
          roughness={0.64}
        />
      </mesh>
    </group>
  );
}

function RoomObjects({
  action,
  activeObjectId,
  broadcastCandidates,
  isPlaying,
  isScreensaver,
  latestEpisode,
  logs,
  onInspectObject,
  subject,
  timeStateLabel,
}: RoomScene3DProps) {
  const palette = getPalette(subject);
  const actionPulse = 0.04 + (action.id.length % 4) * 0.014;
  const roomRef = useRef<THREE.Group>(null);
  const lampLightRef = useRef<THREE.PointLight>(null);
  const lampBulbRef = useRef<THREE.MeshStandardMaterial>(null);
  const latestLog = logs.find((log) => log.subjectId === subject.id);
  const latestCandidate = broadcastCandidates[0];
  const activeBroadcast =
    activeObjectId === "crt" || activeObjectId === "radio";

  useFrame(({ clock, pointer }) => {
    const elapsed = clock.getElapsedTime();

    if (roomRef.current) {
      roomRef.current.rotation.y = Math.sin(elapsed * 0.1) * 0.012 + pointer.x * 0.012;
      roomRef.current.rotation.x = pointer.y * -0.005;
    }

    if (lampLightRef.current) {
      lampLightRef.current.intensity =
        (isScreensaver ? 1.04 : palette.lampIntensity) + Math.sin(elapsed * 1.7) * 0.045;
    }

    if (lampBulbRef.current) {
      lampBulbRef.current.emissiveIntensity =
        0.46 + Math.max(0, Math.sin(elapsed * 1.5)) * 0.08;
    }
  });

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.sky, 3.3, 7.4]} />
      <ambientLight intensity={palette.ambient} />
      <directionalLight
        color={palette.windowGlow}
        intensity={activeObjectId === "window" ? 0.44 : 0.24}
        position={[2.4, 2.6, 1.1]}
      />
      <pointLight
        ref={lampLightRef}
        color={palette.lamp}
        decay={2}
        distance={2.8}
        intensity={palette.lampIntensity}
        position={[0.96, 0.66, 0.52]}
      />
      <pointLight
        color={palette.monitor}
        decay={1.7}
        distance={2.2}
        intensity={0.55 + (activeBroadcast ? 0.24 : 0)}
        position={[-1.08, 0.18, 0.82]}
      />
      <pointLight
        color="#3b82f6"
        decay={2}
        distance={4.8}
        intensity={activeObjectId === "window" ? 0.36 : 0.18}
        position={[1.7, 0.8, -1.34]}
      />

      <group ref={roomRef}>
        <mesh receiveShadow position={[0, -0.86, -0.12]}>
          <boxGeometry args={[4.8, 0.12, 3.9]} />
          <meshStandardMaterial color="#060a16" roughness={0.96} />
        </mesh>
        <mesh receiveShadow position={[0, 0.74, -2.04]}>
          <boxGeometry args={[4.8, 3.2, 0.1]} />
          <meshStandardMaterial color={palette.wall} roughness={0.94} />
        </mesh>
        <mesh receiveShadow position={[-2.42, 0.68, -0.12]}>
          <boxGeometry args={[0.1, 3.1, 3.9]} />
          <meshStandardMaterial color="#050914" roughness={0.94} />
        </mesh>
        <mesh receiveShadow position={[2.42, 0.7, -0.12]}>
          <boxGeometry args={[0.08, 3.1, 3.9]} />
          <meshStandardMaterial color="#030712" roughness={0.96} />
        </mesh>

        <mesh receiveShadow position={[0, -0.34, 0.35]}>
          <boxGeometry args={[3.08, 0.18, 1.16]} />
          <meshStandardMaterial color="#2c1d12" roughness={0.78} />
        </mesh>
        <mesh position={[-1.22, -0.75, 0.05]}>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color="#160f0b" roughness={0.82} />
        </mesh>
        <mesh position={[1.22, -0.75, 0.05]}>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color="#160f0b" roughness={0.82} />
        </mesh>

        {subject.id === "tartar" ? (
          <group
            onClick={(event) => {
              event.stopPropagation();
              onInspectObject("crt");
            }}
            position={[-1.12, 0.04, 0.54]}
            rotation={[0.07, 0.32, -0.02]}
          >
            <mesh>
              <boxGeometry args={[1.1, 0.74, 0.6]} />
              <meshStandardMaterial color="#1f2937" roughness={0.78} />
            </mesh>
            <mesh position={[0, 0.02, 0.32]}>
              <boxGeometry args={[0.82, 0.46, 0.035]} />
              <meshStandardMaterial
                color="#06130f"
                emissive={palette.monitor}
                emissiveIntensity={0.42 + actionPulse + (activeObjectId === "crt" ? 0.24 : 0)}
                roughness={0.5}
              />
            </mesh>
            <mesh position={[0.36, -0.22, 0.34]}>
              <sphereGeometry args={[0.025, 12, 8]} />
              <meshStandardMaterial
                color={palette.monitor}
                emissive={palette.monitor}
                emissiveIntensity={0.72}
              />
            </mesh>
          </group>
        ) : null}

        <group
          onClick={(event) => {
            event.stopPropagation();
            onInspectObject("lamp");
          }}
          position={[1.02, -0.06, 0.46]}
        >
          <mesh>
            <cylinderGeometry args={[0.07, 0.12, 0.62, 18]} />
            <meshStandardMaterial color="#4b3324" roughness={0.66} />
          </mesh>
          <mesh position={[0, 0.37, 0]}>
            <sphereGeometry args={[0.18, 20, 14]} />
            <meshStandardMaterial
              ref={lampBulbRef}
              color="#fed7aa"
              emissive={palette.lamp}
              emissiveIntensity={activeObjectId === "lamp" ? 0.72 : 0.52}
              roughness={0.34}
            />
          </mesh>
        </group>

        <group
          onClick={(event) => {
            event.stopPropagation();
            onInspectObject("window");
          }}
          position={[1.68, 0.62, -1.98]}
        >
          <mesh>
            <boxGeometry args={[1.16, 0.98, 0.05]} />
            <meshStandardMaterial
              color="#071225"
              emissive="#172554"
              emissiveIntensity={activeObjectId === "window" ? 0.38 : 0.18}
              roughness={0.6}
            />
          </mesh>
          <mesh position={[0, 0, 0.034]}>
            <boxGeometry args={[0.92, 0.75, 0.025]} />
            <meshBasicMaterial color="#0c1c35" transparent opacity={0.8} />
          </mesh>
          <RainWindow active={activeObjectId === "window"} />
        </group>

        <ClockFace
          accent={palette.accent}
          active={activeObjectId === "clock"}
          onInspectObject={onInspectObject}
        />
        <OnAirSign accent={palette.accent} active={activeBroadcast || isPlaying} />

        <group position={[-1.72, -0.16, 0.38]}>
          <mesh>
            <sphereGeometry args={[0.42, 28, 18]} />
            <meshStandardMaterial
              color={palette.avatar}
              emissive={palette.accent}
              emissiveIntensity={0.045 + actionPulse}
              roughness={0.76}
            />
          </mesh>
          <mesh position={[0.08, 0.5, 0]}>
            <sphereGeometry args={[0.2, 18, 12]} />
            <meshStandardMaterial color={palette.avatar} roughness={0.7} />
          </mesh>
        </group>

        <DeskClutter
          accent={palette.accent}
          activeMemo={activeObjectId === "memo"}
          onInspectObject={onInspectObject}
          subject={subject}
        />

        {subject.id === "tartar" ? (
          <TartarExtras
            accent={palette.accent}
            activeObjectId={activeObjectId}
            onInspectObject={onInspectObject}
          />
        ) : (
          <KanaExtras
            accent={palette.accent}
            activeObjectId={activeObjectId}
            onInspectObject={onInspectObject}
          />
        )}
      </group>

      {subject.id === "tartar" ? (
        <CrtReadout
          active={activeObjectId === "crt"}
          episode={latestEpisode}
          isPlaying={isPlaying}
        />
      ) : null}
      <TerminalReadout
        active={activeObjectId === "terminal"}
        candidate={latestCandidate}
        latestLog={latestLog}
      />
      <MemoReadout
        active={activeObjectId === "memo" || activeObjectId === "envelope"}
        action={action}
        candidate={latestCandidate}
      />
      <WindowReadout active={activeObjectId === "window"} timeStateLabel={timeStateLabel} />
      <RadioReadout
        active={activeObjectId === "radio"}
        episode={latestEpisode}
        isPlaying={isPlaying}
      />
      <ClockReadout active={activeObjectId === "clock"} timeStateLabel={timeStateLabel} />
      <DustParticles color={palette.accent} />
    </>
  );
}

export default function RoomScene3D(props: RoomScene3DProps) {
  return (
    <Canvas
      camera={{ fov: 56, position: cameraTargets.idle.position }}
      className="room-scene-3d-canvas"
      dpr={[1, 1.25]}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: true,
      }}
      shadows={false}
    >
      <CameraRig activeObjectId={props.activeObjectId} />
      <RoomObjects {...props} />
    </Canvas>
  );
}
