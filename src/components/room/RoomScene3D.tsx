"use client";

import { Html } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import {
  BroadcastThemeCandidate,
  ObservationLog,
  ObservationSubject,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";
import {
  createEpisodeSeedFromThemeCandidate,
  createThemeCandidateFromRoomState,
  ObservationEpisodeSeed,
  ObservationThemeCandidate,
} from "@/components/observation/themeEngine";
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

type WindowRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

type WindowWorld = {
  accent: string;
  aurora?: boolean;
  cars?: boolean;
  cityLights?: boolean;
  fireworks?: boolean;
  fog: number;
  glitch?: boolean;
  id: string;
  label: string;
  lightning?: boolean;
  meteor?: boolean;
  moon?: boolean;
  rain: "none" | "light" | "normal" | "heavy";
  rarity: WindowRarity;
  signal?: boolean;
  skyBottom: string;
  skyTop: string;
  snow?: boolean;
};

type ObjectInteractionHandlers = {
  onPointerOut: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
};

type ObjectInteractionBinder = (objectId: RoomObjectId) => ObjectInteractionHandlers;

const cameraTargets: Record<RoomObjectId | "idle", CameraTarget> = {
  idle: {
    lookAt: [0.08, 0.34, -1.55],
    position: [-0.18, 0.82, 3.82],
  },
  clock: {
    lookAt: [1.34, 1.22, -2.02],
    position: [-0.08, 1.28, 2.76],
  },
  crt: {
    lookAt: [-1.24, -0.02, 0.44],
    position: [-0.88, 0.38, 2.22],
  },
  envelope: {
    lookAt: [-1.55, 0.62, -1.66],
    position: [-0.96, 0.92, 2.56],
  },
  lamp: {
    lookAt: [1.16, 0.04, 0.34],
    position: [0.36, 0.52, 2.16],
  },
  memo: {
    lookAt: [-0.2, -0.24, 0.66],
    position: [-0.28, 0.2, 2.0],
  },
  radio: {
    lookAt: [1.26, -0.16, 0.18],
    position: [0.28, 0.34, 2.28],
  },
  terminal: {
    lookAt: [0.48, 0.0, 0.5],
    position: [-0.05, 0.4, 2.12],
  },
  window: {
    lookAt: [0.08, 0.86, -2.02],
    position: [-0.08, 0.86, 1.86],
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

function hashSeed(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).format(new Date());
}

const windowWorlds: Record<WindowRarity, WindowWorld[]> = {
  common: [
    {
      accent: "#60a5fa",
      cityLights: true,
      fog: 0.18,
      id: "midnight-rain",
      label: "深夜の雨",
      rain: "normal",
      rarity: "common",
      skyBottom: "#0b1b33",
      skyTop: "#020617",
    },
    {
      accent: "#93c5fd",
      cityLights: true,
      fog: 0.24,
      id: "clouded-night",
      label: "曇りの夜",
      rain: "none",
      rarity: "common",
      skyBottom: "#111827",
      skyTop: "#030712",
    },
    {
      accent: "#7dd3fc",
      fog: 0.14,
      id: "light-rain",
      label: "小雨",
      rain: "light",
      rarity: "common",
      skyBottom: "#0f223d",
      skyTop: "#030712",
    },
    {
      accent: "#64748b",
      fog: 0.08,
      id: "quiet-night",
      label: "静かな夜",
      moon: true,
      rain: "none",
      rarity: "common",
      skyBottom: "#0a1020",
      skyTop: "#020617",
    },
    {
      accent: "#fbbf24",
      cityLights: true,
      fog: 0.12,
      id: "distant-city",
      label: "遠くの街明かり",
      rain: "light",
      rarity: "common",
      skyBottom: "#172033",
      skyTop: "#020617",
    },
  ],
  uncommon: [
    {
      accent: "#fb923c",
      fog: 0.1,
      id: "dusk",
      label: "夕暮れ",
      rain: "none",
      rarity: "uncommon",
      skyBottom: "#7c2d12",
      skyTop: "#1e1b4b",
    },
    {
      accent: "#bfdbfe",
      fog: 0.16,
      id: "dawn",
      label: "朝焼け",
      rain: "none",
      rarity: "uncommon",
      skyBottom: "#fbbf77",
      skyTop: "#1d4ed8",
    },
    {
      accent: "#93c5fd",
      cityLights: true,
      fog: 0.22,
      id: "hard-rain",
      label: "強めの雨",
      rain: "heavy",
      rarity: "uncommon",
      skyBottom: "#0b1b33",
      skyTop: "#020617",
    },
    {
      accent: "#cbd5e1",
      fog: 0.5,
      id: "fog",
      label: "霧",
      rain: "none",
      rarity: "uncommon",
      skyBottom: "#1f2937",
      skyTop: "#0f172a",
    },
    {
      accent: "#f97316",
      cars: true,
      fog: 0.15,
      id: "car-lights",
      label: "遠くで車のライトが流れる",
      rain: "light",
      rarity: "uncommon",
      skyBottom: "#111827",
      skyTop: "#020617",
    },
  ],
  rare: [
    {
      accent: "#c4b5fd",
      lightning: true,
      fog: 0.25,
      id: "thunder",
      label: "雷",
      rain: "heavy",
      rarity: "rare",
      skyBottom: "#111827",
      skyTop: "#020617",
    },
    {
      accent: "#e5e7eb",
      fog: 0.72,
      id: "dense-fog",
      label: "濃霧",
      rain: "none",
      rarity: "rare",
      skyBottom: "#1f2937",
      skyTop: "#111827",
    },
    {
      accent: "#bfdbfe",
      fog: 0.08,
      id: "meteor",
      label: "流れ星",
      meteor: true,
      rain: "none",
      rarity: "rare",
      skyBottom: "#172554",
      skyTop: "#020617",
    },
    {
      accent: "#fde68a",
      fog: 0.12,
      id: "large-moon",
      label: "月が大きい夜",
      moon: true,
      rain: "none",
      rarity: "rare",
      skyBottom: "#172033",
      skyTop: "#020617",
    },
    {
      accent: "#facc15",
      cityLights: true,
      fog: 0.14,
      id: "one-building",
      label: "遠くのビルだけ点灯している",
      rain: "light",
      rarity: "rare",
      skyBottom: "#0f172a",
      skyTop: "#020617",
    },
  ],
  epic: [
    {
      accent: "#e0f2fe",
      fog: 0.18,
      id: "snow",
      label: "雪",
      rain: "none",
      rarity: "epic",
      skyBottom: "#1e3a5f",
      skyTop: "#082f49",
      snow: true,
    },
    {
      accent: "#f472b6",
      fireworks: true,
      fog: 0.08,
      id: "fireworks",
      label: "花火",
      rain: "none",
      rarity: "epic",
      skyBottom: "#2e1065",
      skyTop: "#020617",
    },
    {
      accent: "#ef4444",
      fog: 0.16,
      id: "red-moon",
      label: "赤い月",
      moon: true,
      rain: "none",
      rarity: "epic",
      skyBottom: "#3f1212",
      skyTop: "#020617",
    },
    {
      accent: "#22d3ee",
      fog: 0.12,
      id: "radio-tower",
      label: "遠くの電波塔が光る",
      rain: "light",
      rarity: "epic",
      signal: true,
      skyBottom: "#083344",
      skyTop: "#020617",
    },
    {
      accent: "#fbbf24",
      cityLights: true,
      fog: 0.2,
      id: "after-rain-reflection",
      label: "雨上がりで地面が反射している",
      rain: "light",
      rarity: "epic",
      skyBottom: "#1e293b",
      skyTop: "#020617",
    },
  ],
  legendary: [
    {
      accent: "#5eead4",
      aurora: true,
      fog: 0.1,
      id: "aurora",
      label: "オーロラ",
      rain: "none",
      rarity: "legendary",
      skyBottom: "#064e3b",
      skyTop: "#020617",
    },
    {
      accent: "#a7f3d0",
      fog: 0.18,
      id: "signal-light",
      label: "謎の信号光",
      rain: "none",
      rarity: "legendary",
      signal: true,
      skyBottom: "#083344",
      skyTop: "#020617",
    },
    {
      accent: "#c084fc",
      fog: 0.24,
      glitch: true,
      id: "almost-shadow",
      label: "一瞬だけ人影のようなもの",
      rain: "light",
      rarity: "legendary",
      skyBottom: "#18181b",
      skyTop: "#020617",
    },
    {
      accent: "#67e8f9",
      fog: 0.16,
      glitch: true,
      id: "bugged-night",
      label: "世界が少しバグったような夜",
      rain: "none",
      rarity: "legendary",
      skyBottom: "#0f172a",
      skyTop: "#020617",
    },
    {
      accent: "#fb7185",
      fog: 0.18,
      id: "on-air-sky",
      label: "ON AIR光が空に反射している夜",
      rain: "light",
      rarity: "legendary",
      signal: true,
      skyBottom: "#451a2c",
      skyTop: "#020617",
    },
  ],
};

function pickWindowRarity(roll: number): WindowRarity {
  if (roll < 0.005) {
    return "legendary";
  }

  if (roll < 0.02) {
    return "epic";
  }

  if (roll < 0.1) {
    return "rare";
  }

  if (roll < 0.3) {
    return "uncommon";
  }

  return "common";
}

function getWindowWorld(subject: ObservationSubject): WindowWorld {
  const phase = getTimePhase();
  const seed = hashSeed(`${getTodayKey()}-${subject.id}-observation-world`);
  const rarity = pickWindowRarity((seed % 1000) / 1000);
  const choices = windowWorlds[rarity];
  const world = choices[Math.floor(seed / 1000) % choices.length];

  if (phase === "morning") {
    return {
      ...world,
      accent: rarity === "legendary" ? world.accent : "#f4a06f",
      label: world.label.includes("朝") ? world.label : `${world.label} / 朝焼け`,
      skyBottom: rarity === "legendary" ? world.skyBottom : "#b86b7d",
      skyTop: rarity === "legendary" ? world.skyTop : "#1a2454",
    };
  }

  if (phase === "evening" && rarity === "common") {
    return {
      ...world,
      accent: "#fb923c",
      label: `${world.label} / 夕方`,
      skyBottom: "#7c2d12",
      skyTop: "#312e81",
    };
  }

  if (rarity !== "legendary") {
    return {
      ...world,
      accent: rarity === "epic" ? world.accent : "#f4a06f",
      label: world.label.includes("朝") ? world.label : `${world.label} / 朝焼け`,
      skyBottom: rarity === "epic" ? world.skyBottom : "#b86b7d",
      skyTop: rarity === "rare" ? "#232051" : "#1a2454",
    };
  }

  return world;
}

function getRarityStrength(rarity: WindowRarity) {
  if (rarity === "legendary") {
    return 2.15;
  }

  if (rarity === "epic") {
    return 1.74;
  }

  if (rarity === "rare") {
    return 1.42;
  }

  if (rarity === "uncommon") {
    return 1.18;
  }

  return 1;
}

function getPalette(subject: ObservationSubject): SubjectPalette {
  const phase = getTimePhase();
  const isMorning = phase === "morning";
  const isEvening = phase === "evening";
  const isDeepNight = phase === "deep-night";

  if (subject.id === "kana") {
    return {
      accent: "#f9a8d4",
      ambient: isMorning ? 0.34 : isEvening ? 0.2 : isDeepNight ? 0.14 : 0.18,
      avatar: "#fbcfe8",
      lamp: isMorning ? "#ffd0a3" : "#f59e85",
      lampIntensity: isMorning ? 1.28 : isDeepNight ? 1.38 : 1.18,
      monitor: "#f9a8d4",
      sky: isMorning ? "#162345" : isEvening ? "#120a16" : "#08111f",
      wall: isMorning ? "#20223a" : "#12162a",
      windowGlow: isMorning ? "#f9a8d4" : isEvening ? "#f9a8d4" : "#93c5fd",
    };
  }

  return {
    accent: "#67e8f9",
    ambient: isMorning ? 0.32 : isEvening ? 0.18 : isDeepNight ? 0.13 : 0.17,
    avatar: "#a5f3fc",
    lamp: isMorning ? "#ffd08a" : "#f59e0b",
    lampIntensity: isMorning ? 1.34 : isDeepNight ? 1.46 : 1.24,
    monitor: "#86efac",
    sky: isMorning ? "#17264b" : isEvening ? "#100a15" : "#08111f",
    wall: isMorning ? "#1c2740" : "#0d1428",
    windowGlow: isMorning ? "#f4a06f" : isEvening ? "#fbbf77" : "#93c5fd",
  };
}

function CameraRig({ activeObjectId }: { activeObjectId?: RoomObjectId | null }) {
  const lookAtRef = useRef(new THREE.Vector3(...cameraTargets.idle.lookAt));
  const positionRef = useRef(new THREE.Vector3(...cameraTargets.idle.position));
  const nextLookAt = useRef(new THREE.Vector3());
  const nextPosition = useRef(new THREE.Vector3());

  useFrame(({ camera, clock, pointer, size }) => {
    const target = cameraTargets[activeObjectId ?? "idle"] ?? cameraTargets.idle;
    const selected = Boolean(activeObjectId);
    const breathe = Math.sin(clock.elapsedTime * 0.38) * 0.018;
    const isNarrow = size.width < 700;

    nextPosition.current
      .set(...target.position)
      .add(
        new THREE.Vector3(
          pointer.x * 0.08 + (isNarrow ? -0.14 : 0),
          pointer.y * 0.045 + breathe + (isNarrow ? 0.06 : 0),
          isNarrow ? 0.72 : 0,
        ),
      );
    nextLookAt.current
      .set(...target.lookAt)
      .add(
        new THREE.Vector3(
          pointer.x * 0.055,
          pointer.y * 0.025 + (isNarrow ? -0.16 : 0),
          0,
        ),
      );

    positionRef.current.lerp(nextPosition.current, selected ? 0.045 : 0.026);
    lookAtRef.current.lerp(nextLookAt.current, selected ? 0.055 : 0.03);
    camera.position.copy(positionRef.current);
    camera.lookAt(lookAtRef.current);
  });

  return null;
}

function RainLayer({
  count,
  color = "#bfdbfe",
  opacity,
  speed,
  width,
}: {
  count: number;
  color?: string;
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
          <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}

function SnowLayer({ active }: { active: boolean }) {
  const snowRef = useRef<THREE.Group>(null);
  const flakes = useMemo(
    () =>
      Array.from({ length: 30 }, (_, index) => ({
        x: -0.45 + (index % 6) * 0.18,
        y: -0.34 + Math.floor(index / 6) * 0.16,
        z: 0.03 + (index % 3) * 0.006,
      })),
    [],
  );

  useFrame(({ clock }) => {
    if (snowRef.current) {
      snowRef.current.position.y = -((clock.elapsedTime * 0.025) % 0.24);
      snowRef.current.position.x = Math.sin(clock.elapsedTime * 0.42) * 0.018;
    }
  });

  return (
    <group ref={snowRef}>
      {flakes.map((flake, index) => (
        <mesh key={index} position={[flake.x, flake.y, flake.z]}>
          <boxGeometry args={[0.012, 0.012, 0.004]} />
          <meshBasicMaterial color="#e0f2fe" transparent opacity={active ? 0.52 : 0.34} />
        </mesh>
      ))}
    </group>
  );
}

function WindowWorldBackdrop({
  active,
  world,
}: {
  active: boolean;
  world: WindowWorld;
}) {
  const signalOpacity = active ? 0.72 : 0.42;
  const rarityStrength = getRarityStrength(world.rarity);
  const buildingCount = world.rarity === "common" ? 5 : world.rarity === "uncommon" ? 6 : 8;
  const accentOpacity = (active ? 0.34 : 0.22) * rarityStrength;

  return (
    <group position={[0, 0, 0.04]}>
      <mesh>
        <planeGeometry args={[1.28, 1.0]} />
        <meshBasicMaterial color={world.skyTop} />
      </mesh>
      <mesh position={[0, -0.15, 0.002]}>
        <planeGeometry args={[1.28, 0.66]} />
        <meshBasicMaterial color={world.skyBottom} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0.08, -0.02, 0.004]}>
        <planeGeometry args={[1.05, 0.54]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={world.accent}
          depthWrite={false}
          transparent
          opacity={Math.min(0.36, 0.12 * rarityStrength + (active ? 0.08 : 0.04))}
        />
      </mesh>
      <mesh position={[0, 0.16, 0.006]} rotation={[0, 0, 0.04]}>
        <planeGeometry args={[0.92, 0.09]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.16 + world.fog * 0.18} />
      </mesh>
      <mesh position={[-0.16, 0.03, 0.007]} rotation={[0, 0, -0.08]}>
        <planeGeometry args={[0.78, 0.07]} />
        <meshBasicMaterial color="#334155" transparent opacity={0.1 + world.fog * 0.22} />
      </mesh>
      <mesh position={[0, -0.28, 0.004]}>
        <boxGeometry args={[1.18, 0.12, 0.01]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.62} />
      </mesh>
      {Array.from({ length: buildingCount }, (_, index) => {
        const height = 0.16 + (index % 4) * 0.045;
        const x = -0.54 + index * (1.08 / Math.max(1, buildingCount - 1));
        const lit = world.cityLights || world.signal || world.rarity !== "common";

        return (
          <group key={index} position={[x, -0.25 + height / 2, 0.012]}>
            <mesh>
              <boxGeometry args={[0.095, height, 0.01]} />
              <meshBasicMaterial color={index % 2 ? "#020617" : "#08111f"} transparent opacity={0.76} />
            </mesh>
            {lit ? (
              <mesh position={[0.016, height * 0.18, 0.006]}>
                <boxGeometry args={[0.026, 0.01, 0.006]} />
                <meshBasicMaterial
                  blending={THREE.AdditiveBlending}
                  color={index % 3 ? world.accent : "#fbbf24"}
                  depthWrite={false}
                  transparent
                  opacity={Math.min(0.96, 0.42 * rarityStrength + (active ? 0.18 : 0.06))}
                />
              </mesh>
            ) : null}
          </group>
        );
      })}
      <group position={[0.03, -0.18, 0.024]}>
        {[-0.28, 0.02, 0.32].map((x, index) => (
          <mesh key={x} position={[x, index % 2 ? 0.02 : -0.015, 0]}>
            <boxGeometry args={[0.12, 0.026, 0.006]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color={index === 1 ? "#fbbf24" : world.accent}
              depthWrite={false}
              transparent
              opacity={Math.min(0.72, 0.28 * rarityStrength + (active ? 0.12 : 0.06))}
            />
          </mesh>
        ))}
      </group>
      <group position={[0, -0.06, 0.02]}>
        {[-0.18, 0.02, 0.22].map((wireY, index) => (
          <mesh key={wireY} position={[0, wireY, 0]} rotation={[0, 0, -0.035 + index * 0.018]}>
            <boxGeometry args={[1.18, 0.006, 0.004]} />
            <meshBasicMaterial color="#020617" transparent opacity={0.48} />
          </mesh>
        ))}
      </group>
      {world.cars ? (
        <mesh position={[-0.05, -0.31, 0.015]} rotation={[0, 0, -0.03]}>
          <boxGeometry args={[0.5, 0.015, 0.006]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color="#fb923c"
            depthWrite={false}
            transparent
            opacity={active ? 0.46 : 0.28}
          />
        </mesh>
      ) : null}
      {world.moon ? (
        <mesh position={[0.26, 0.22, 0.012]}>
          <circleGeometry args={[0.08 + rarityStrength * 0.018, 18]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color={world.accent}
            depthWrite={false}
            transparent
            opacity={Math.min(0.92, active ? 0.56 + rarityStrength * 0.12 : 0.34 + rarityStrength * 0.08)}
          />
        </mesh>
      ) : null}
      {world.meteor ? (
        <mesh position={[-0.1, 0.22, 0.018]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.38, 0.01, 0.006]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color="#bfdbfe"
            depthWrite={false}
            transparent
            opacity={active ? 0.78 : 0.42}
          />
        </mesh>
      ) : null}
      {world.lightning ? (
        <mesh position={[0.08, 0.12, 0.018]} rotation={[0, 0, -0.2]}>
          <boxGeometry args={[0.045, 0.48, 0.006]} />
          <meshBasicMaterial
            blending={THREE.AdditiveBlending}
            color="#ddd6fe"
            depthWrite={false}
            transparent
            opacity={active ? 0.72 : 0.34}
          />
        </mesh>
      ) : null}
      {world.aurora ? (
        <group>
          <mesh position={[-0.12, 0.16, 0.014]} rotation={[0, 0, 0.16]}>
            <planeGeometry args={[0.74, 0.09]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color="#5eead4"
              depthWrite={false}
              transparent
              opacity={active ? 0.68 : 0.38}
            />
          </mesh>
          <mesh position={[0.18, 0.09, 0.015]} rotation={[0, 0, -0.1]}>
            <planeGeometry args={[0.58, 0.07]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color="#a78bfa"
              depthWrite={false}
              transparent
              opacity={active ? 0.52 : 0.28}
            />
          </mesh>
        </group>
      ) : null}
      {world.fireworks ? (
        <group position={[0.18, 0.12, 0.018]}>
          {Array.from({ length: 8 }, (_, index) => (
            <mesh key={index} rotation={[0, 0, (index / 8) * Math.PI * 2]}>
              <boxGeometry args={[0.13, 0.008, 0.006]} />
              <meshBasicMaterial
                blending={THREE.AdditiveBlending}
                color={index % 2 ? "#f472b6" : "#facc15"}
                depthWrite={false}
                transparent
                opacity={active ? 0.54 : 0.24}
              />
            </mesh>
          ))}
        </group>
      ) : null}
      {world.signal ? (
        <group position={[0.32, -0.12, 0.016]}>
          <mesh>
            <boxGeometry args={[0.025, 0.34, 0.006]} />
            <meshBasicMaterial color="#020617" transparent opacity={0.75} />
          </mesh>
          <mesh position={[0, 0.18, 0.008]}>
            <boxGeometry args={[0.08, 0.035, 0.006]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color={world.accent}
              depthWrite={false}
              transparent
              opacity={signalOpacity}
            />
          </mesh>
        </group>
      ) : null}
      <mesh position={[0, -0.38, 0.018]} rotation={[0, 0, -0.08]}>
        <planeGeometry args={[1.04, 0.035]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={world.accent}
          depthWrite={false}
          transparent
          opacity={Math.min(0.48, accentOpacity * 0.42)}
        />
      </mesh>
      {world.glitch ? (
        <group>
          <mesh position={[-0.26, -0.16, 0.017]}>
            <boxGeometry args={[0.048, 0.24, 0.008]} />
            <meshBasicMaterial color="#020617" transparent opacity={0.58} />
          </mesh>
          <mesh position={[0.02, 0.04, 0.018]}>
            <boxGeometry args={[0.46, 0.012, 0.006]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color={world.accent}
              depthWrite={false}
              transparent
              opacity={active ? 0.22 : 0.11}
            />
          </mesh>
        </group>
      ) : null}
      {world.fog > 0 ? (
        <mesh position={[0, 0, 0.022]}>
          <planeGeometry args={[1.28, 1.0]} />
          <meshBasicMaterial color="#cbd5e1" transparent opacity={world.fog * (active ? 0.46 : 0.32)} />
        </mesh>
      ) : null}
    </group>
  );
}

function RainWindow({
  active,
  world,
}: {
  active: boolean;
  world: WindowWorld;
}) {
  const rainLevel = world.rain === "heavy" ? 1.45 : world.rain === "light" ? 0.62 : world.rain === "none" ? 0 : 1;
  const rarityStrength = getRarityStrength(world.rarity);

  return (
    <group position={[0, 0, 0.055]}>
      <WindowWorldBackdrop active={active} world={world} />
      {rainLevel > 0 ? (
        <>
          <RainLayer
            count={Math.round(22 * rainLevel)}
            opacity={(active ? 0.3 : 0.16) * rainLevel}
            speed={0.055}
            width={0.005}
          />
          <RainLayer
            count={Math.round(14 * rainLevel)}
            opacity={(active ? 0.36 : 0.22) * rainLevel}
            speed={0.1}
            width={0.009}
          />
          <RainLayer
            count={Math.round(9 * rainLevel)}
            opacity={(active ? 0.43 : 0.27) * rainLevel}
            speed={0.16}
            width={0.012}
          />
          <RainLayer
            color={world.accent}
            count={Math.round(8 * rainLevel)}
            opacity={(active ? 0.24 : 0.14) * rainLevel}
            speed={0.21}
            width={0.016}
          />
        </>
      ) : null}
      {world.snow ? <SnowLayer active={active} /> : null}
      <mesh position={[-0.28, 0.03, 0.046]} rotation={[0, 0, -0.55]}>
        <planeGeometry args={[0.96, 0.018]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color="#dbeafe"
          depthWrite={false}
          transparent
          opacity={active ? 0.16 : 0.08}
        />
      </mesh>
      <mesh position={[0.26, 0.12, 0.047]} rotation={[0, 0, -0.62]}>
        <planeGeometry args={[0.7, 0.012]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={world.accent}
          depthWrite={false}
          transparent
          opacity={Math.min(0.24, 0.08 * rarityStrength + (active ? 0.05 : 0))}
        />
      </mesh>
      <mesh position={[0.18, 0.13, 0.038]} rotation={[0, 0, -0.28]}>
        <planeGeometry args={[0.68, 0.035]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={world.accent}
          depthWrite={false}
          transparent
          opacity={active ? 0.18 : 0.09}
        />
      </mesh>
      <mesh position={[-0.22, -0.18, 0.039]} rotation={[0, 0, -0.2]}>
        <planeGeometry args={[0.48, 0.024]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={world.rarity === "legendary" ? world.accent : "#93c5fd"}
          depthWrite={false}
          transparent
          opacity={active ? 0.18 : 0.08}
        />
      </mesh>
      <mesh position={[0, -0.02, 0.03]}>
        <boxGeometry args={[0.98, 0.8, 0.014]} />
        <meshBasicMaterial color="#dbeafe" transparent opacity={active ? 0.1 : 0.055} />
      </mesh>
    </group>
  );
}

function WindowFrame({
  active,
  world,
}: {
  active: boolean;
  world: WindowWorld;
}) {
  const rarityStrength = getRarityStrength(world.rarity);
  const frameColor = world.rarity === "legendary" ? "#172d3a" : "#2a1d14";
  const glow = active ? 0.08 + rarityStrength * 0.018 : 0.035 + rarityStrength * 0.012;

  return (
    <group>
      <mesh position={[0, 0, -0.038]}>
        <boxGeometry args={[1.55, 1.32, 0.12]} />
        <meshStandardMaterial
          color="#030712"
          emissive={world.accent}
          emissiveIntensity={0.025 * rarityStrength}
          flatShading
          roughness={0.88}
        />
      </mesh>
      <mesh position={[-0.76, 0, 0.035]}>
        <boxGeometry args={[0.11, 1.36, 0.19]} />
        <meshStandardMaterial color={frameColor} emissive={world.accent} emissiveIntensity={glow} flatShading roughness={0.74} />
      </mesh>
      <mesh position={[0.76, 0, 0.035]}>
        <boxGeometry args={[0.11, 1.36, 0.19]} />
        <meshStandardMaterial color={frameColor} emissive={world.accent} emissiveIntensity={glow} flatShading roughness={0.74} />
      </mesh>
      <mesh position={[0, 0.65, 0.035]}>
        <boxGeometry args={[1.62, 0.11, 0.19]} />
        <meshStandardMaterial color={frameColor} emissive={world.accent} emissiveIntensity={glow} flatShading roughness={0.74} />
      </mesh>
      <mesh position={[0, -0.65, 0.052]}>
        <boxGeometry args={[1.72, 0.13, 0.26]} />
        <meshStandardMaterial
          color="#25170f"
          emissive={world.accent}
          emissiveIntensity={active ? 0.11 * rarityStrength : 0.05 * rarityStrength}
          flatShading
          roughness={0.58}
        />
      </mesh>
      <mesh position={[0, -0.78, 0.09]}>
        <boxGeometry args={[1.86, 0.07, 0.36]} />
        <meshStandardMaterial
          color="#120b08"
          emissive={world.accent}
          emissiveIntensity={0.035 * rarityStrength}
          flatShading
          roughness={0.52}
        />
      </mesh>
      <mesh position={[0, 0, 0.09]}>
        <boxGeometry args={[0.04, 1.1, 0.09]} />
        <meshStandardMaterial color="#0f172a" emissive={world.accent} emissiveIntensity={glow * 0.8} flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.02, 0.092]}>
        <boxGeometry args={[1.18, 0.035, 0.09]} />
        <meshStandardMaterial color="#0f172a" emissive={world.accent} emissiveIntensity={glow * 0.75} flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.88, 0.08]} rotation={[0, 0, 0.03]}>
        <planeGeometry args={[1.98, 0.24]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.38} />
      </mesh>
      <mesh position={[0.05, -0.62, 0.18]} rotation={[-Math.PI / 2, 0, -0.08]}>
        <planeGeometry args={[1.58, 0.4]} />
        <meshBasicMaterial
          blending={THREE.AdditiveBlending}
          color={world.accent}
          depthWrite={false}
          transparent
          opacity={Math.min(0.26, 0.07 * rarityStrength + (active ? 0.06 : 0))}
        />
      </mesh>
    </group>
  );
}

function GlowPlane({
  color,
  opacity,
  position,
  rotation,
  scale,
}: {
  color: string;
  opacity: number;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        color={color}
        depthWrite={false}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

function LightBloom({
  activeBroadcast,
  activeWindow,
  palette,
  subject,
}: {
  activeBroadcast: boolean;
  activeWindow: boolean;
  palette: SubjectPalette;
  subject: ObservationSubject;
}) {
  const crtOpacity = subject.id === "tartar" ? (activeBroadcast ? 0.22 : 0.12) : 0;
  const lampOpacity = subject.id === "kana" ? 0.16 : 0.14;

  return (
    <group>
      <GlowPlane
        color={palette.lamp}
        opacity={lampOpacity}
        position={[0.7, -0.245, 0.48]}
        rotation={[-Math.PI / 2, 0, -0.22]}
        scale={[2.1, 1.05, 1]}
      />
      <GlowPlane
        color={palette.lamp}
        opacity={0.09}
        position={[0.35, -0.82, 0.48]}
        rotation={[-Math.PI / 2, 0, -0.16]}
        scale={[2.6, 1.45, 1]}
      />
      {subject.id === "tartar" ? (
        <>
          <GlowPlane
            color={palette.monitor}
            opacity={crtOpacity}
            position={[-1.34, 0.0, 0.76]}
            rotation={[0.05, 0.46, -0.02]}
            scale={[1.02, 0.54, 1]}
          />
          <GlowPlane
            color={palette.monitor}
            opacity={activeBroadcast ? 0.12 : 0.06}
            position={[-1.0, -0.248, 0.72]}
            rotation={[-Math.PI / 2, 0, 0.06]}
            scale={[1.55, 0.7, 1]}
          />
        </>
      ) : null}
      <GlowPlane
        color={palette.windowGlow}
        opacity={activeWindow ? 0.18 : 0.09}
        position={[1.3, -0.8, -1.36]}
        rotation={[-Math.PI / 2, 0, -0.35]}
        scale={[3.0, 1.35, 1]}
      />
      <GlowPlane
        color="#3b82f6"
        opacity={activeWindow ? 0.12 : 0.065}
        position={[1.42, 0.42, -2.12]}
        rotation={[0, -0.08, 0]}
        scale={[1.9, 1.35, 1]}
      />
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
  bindObject,
  onInspectObject,
}: {
  accent: string;
  active: boolean;
  bindObject: ObjectInteractionBinder;
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
      {...bindObject("clock")}
    >
      <mesh>
        <cylinderGeometry args={[0.18, 0.18, 0.025, 32]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={active ? 0.34 : 0.1}
          flatShading
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
          flatShading
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

const objectLabelPositions: Record<RoomObjectId, [number, number, number]> = {
  clock: [1.34, 1.46, -2.0],
  crt: [-1.34, 0.42, 0.48],
  envelope: [-1.42, 1.38, -1.76],
  lamp: [1.18, 0.58, 0.34],
  memo: [-0.2, 0.02, 0.72],
  radio: [1.26, 0.02, 0.1],
  terminal: [0.42, 0.38, 0.48],
  window: [0.08, 1.58, -1.62],
};

function ObjectWhisperLabel({
  label,
  objectId,
}: {
  label?: string;
  objectId?: RoomObjectId | null;
}) {
  if (!objectId || !label) {
    return null;
  }

  return (
    <SceneHtml
      className="is-active scene-object-whisper"
      position={objectLabelPositions[objectId]}
      rotation={[0, 0, 0]}
    >
      <div>
        <span>{label}</span>
      </div>
    </SceneHtml>
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
      position={[-1.34, 0.06, 0.56]}
      rotation={[0.05, 0.46, -0.02]}
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
      position={[0.42, 0.08, 0.56]}
      rotation={[0.02, -0.22, 0]}
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
      position={[-0.26, -0.11, 0.82]}
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
  episodeSeed,
  themeCandidate,
  timeStateLabel,
  world,
}: {
  active: boolean;
  episodeSeed: ObservationEpisodeSeed;
  themeCandidate: ObservationThemeCandidate;
  timeStateLabel: string;
  world: WindowWorld;
}) {
  if (!active) {
    return null;
  }

  const observationNotes = [
    world.rain === "heavy"
      ? "強い雨筋"
      : world.rain === "normal"
        ? "雨の匂い"
        : world.rain === "light"
          ? "細い雨"
          : "静かな空",
    world.cityLights ? "信号の光" : world.moon ? "月の輪郭" : "雲の影",
    world.signal ? "遠い信号" : world.cars ? "車の光" : "電線の音",
  ];

  return (
    <SceneHtml
      className="is-active scene-window-readout"
      position={[0.08, 1.02, -1.12]}
      rotation={[0, -0.08, 0]}
    >
      <div>
        <span>今日の観察 / {timeStateLabel}</span>
        <strong>{observationNotes.join(" / ")}</strong>
        <small>themeCandidate: {themeCandidate.theme}</small>
        <small>この窓から生まれそうな問い: {episodeSeed.episodeQuestion}</small>
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
      position={[1.28, 0.08, 0.24]}
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
      position={[1.08, 1.2, -1.52]}
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
  bindObject,
  onInspectObject,
  subject,
}: {
  accent: string;
  activeMemo: boolean;
  bindObject: ObjectInteractionBinder;
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
        position={[-0.28, -0.23, 0.74]}
        rotation={[0.04, -0.28, -0.14]}
        {...bindObject("memo")}
      >
        <boxGeometry args={[0.52, 0.012, 0.34]} />
        <meshStandardMaterial
          color={paperColor}
          emissive={accent}
          emissiveIntensity={activeMemo ? 0.2 : 0.035}
          flatShading
          roughness={0.86}
        />
      </mesh>
      {[
        [0.08, -0.215, 0.86, 0.18, "#fef3c7"],
        [-0.62, -0.205, 0.36, -0.08, "#ead7b1"],
        [0.48, -0.21, 0.9, -0.24, "#f7d28a"],
      ].map(([x, y, z, rotation, color], index) => (
        <mesh
          key={index}
          position={[x as number, y as number, z as number]}
          rotation={[0, 0.1, rotation as number]}
        >
          <boxGeometry args={[index === 1 ? 0.34 : 0.24, 0.009, index === 1 ? 0.22 : 0.14]} />
          <meshStandardMaterial color={color as string} flatShading roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0.18, -0.19, 0.58]} rotation={[0, 0, -0.38]}>
        <cylinderGeometry args={[0.012, 0.012, 0.42, 10]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={0.04}
          flatShading
        />
      </mesh>
      <mesh position={[1.02, -0.17, 0.46]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.085, 0.085, 0.16, 22]} />
        <meshStandardMaterial color="#1f2937" flatShading roughness={0.7} />
      </mesh>
      <mesh position={[1.04, -0.06, 0.46]}>
        <torusGeometry args={[0.07, 0.008, 6, 18]} />
        <meshStandardMaterial color="#334155" flatShading roughness={0.78} />
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

function BookStack({
  accent,
  active,
  bindObject,
  onInspectObject,
  position,
}: {
  accent: string;
  active: boolean;
  bindObject: ObjectInteractionBinder;
  onInspectObject: (objectId: RoomObjectId) => void;
  position: [number, number, number];
}) {
  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onInspectObject("envelope");
      }}
      position={position}
      {...bindObject("envelope")}
    >
      {["#1e293b", "#334155", "#581c87"].map((color, index) => (
        <mesh key={color} position={[0, index * 0.055, 0]} rotation={[0, 0, index * 0.03]}>
          <boxGeometry args={[0.42 - index * 0.04, 0.045, 0.26]} />
          <meshStandardMaterial
            color={color}
            emissive={accent}
            emissiveIntensity={active ? 0.06 : 0}
            flatShading
            roughness={0.76}
          />
        </mesh>
      ))}
    </group>
  );
}

function LowPolyChair({
  accent,
  introActive,
  subject,
}: {
  accent: string;
  introActive: boolean;
  subject: ObservationSubject;
}) {
  const color = subject.id === "kana" ? "#3a2939" : "#1f2937";
  const chairRef = useRef<THREE.Group>(null);
  const introStartedAt = useRef<number | null>(null);

  useEffect(() => {
    introStartedAt.current = null;
  }, [introActive]);

  useFrame(({ clock }) => {
    const chair = chairRef.current;

    if (!chair) {
      return;
    }

    const finalPosition = new THREE.Vector3(-0.78, -0.66, 1.18);
    const startPosition = new THREE.Vector3(-0.52, -0.66, 0.84);

    if (!introActive || subject.id !== "tartar") {
      chair.position.copy(finalPosition);
      chair.rotation.y = -0.42;
      return;
    }

    if (introStartedAt.current === null) {
      introStartedAt.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - introStartedAt.current;
    const pullProgress = THREE.MathUtils.smoothstep(elapsed, 0.45, 2.05);
    const settle = Math.sin(Math.min(1, elapsed / 2.4) * Math.PI) * 0.035;

    chair.position.lerpVectors(startPosition, finalPosition, pullProgress);
    chair.position.x += settle;
    chair.rotation.y = THREE.MathUtils.lerp(-0.1, -0.42, pullProgress);
  });

  return (
    <group ref={chairRef} position={[-0.78, -0.66, 1.18]} rotation={[0, -0.42, 0]}>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.58, 0.12, 0.56]} />
        <meshStandardMaterial
          color={color}
          emissive={accent}
          emissiveIntensity={0.018}
          flatShading
          roughness={0.82}
        />
      </mesh>
      <mesh position={[0, 0.48, -0.24]} rotation={[0.18, 0, 0]}>
        <boxGeometry args={[0.62, 0.82, 0.1]} />
        <meshStandardMaterial
          color={color}
          emissive={accent}
          emissiveIntensity={0.03}
          flatShading
          roughness={0.86}
        />
      </mesh>
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 0.16, 0.02]}>
          <boxGeometry args={[0.08, 0.1, 0.46]} />
          <meshStandardMaterial color="#111827" flatShading roughness={0.84} />
        </mesh>
      ))}
      <mesh position={[0, -0.26, 0]}>
        <cylinderGeometry args={[0.045, 0.045, 0.52, 8]} />
        <meshStandardMaterial color="#0b0f19" flatShading roughness={0.82} />
      </mesh>
      {Array.from({ length: 5 }, (_, index) => (
        <group key={index} rotation={[0, (index / 5) * Math.PI * 2, 0]}>
          <mesh position={[0.22, -0.53, 0]}>
            <boxGeometry args={[0.36, 0.045, 0.045]} />
            <meshStandardMaterial color="#0b0f19" flatShading roughness={0.82} />
          </mesh>
          <mesh position={[0.42, -0.55, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.035, 8]} />
            <meshStandardMaterial color="#111827" flatShading roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function EntryTartarTrace({
  accent,
  active,
}: {
  accent: string;
  active: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    startedAt.current = null;
  }, [active]);

  useFrame(({ clock }) => {
    const group = groupRef.current;

    if (!group) {
      return;
    }

    if (!active) {
      group.visible = false;
      return;
    }

    if (startedAt.current === null) {
      startedAt.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - startedAt.current;
    group.visible = elapsed < 4.8;

    const rise = THREE.MathUtils.smoothstep(elapsed, 0.9, 2.0);
    const leave = THREE.MathUtils.smoothstep(elapsed, 2.05, 4.2);
    const breathe = Math.sin(clock.elapsedTime * 2.1) * 0.012;

    group.position.set(
      THREE.MathUtils.lerp(-0.63, 2.15, leave),
      THREE.MathUtils.lerp(-0.3, -0.02, rise) + breathe,
      THREE.MathUtils.lerp(0.86, -0.78, leave),
    );
    group.rotation.y = THREE.MathUtils.lerp(-0.28, -1.45, leave);
    group.scale.setScalar(THREE.MathUtils.lerp(0.86, 0.72, leave));
  });

  return (
    <group ref={groupRef} position={[-0.63, -0.3, 0.86]} rotation={[0, -0.28, 0]}>
      <mesh position={[0, 0.42, 0]}>
        <dodecahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive={accent}
          emissiveIntensity={0.08}
          flatShading
          roughness={0.78}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.22, 0.34, 0.12]} />
        <meshStandardMaterial
          color="#111827"
          emissive={accent}
          emissiveIntensity={0.05}
          flatShading
          roughness={0.82}
          transparent
          opacity={0.9}
        />
      </mesh>
      {[-0.09, 0.09].map((x) => (
        <mesh key={x} position={[x, -0.08, 0.01]} rotation={[0.12, 0, x > 0 ? -0.12 : 0.16]}>
          <boxGeometry args={[0.06, 0.28, 0.06]} />
          <meshStandardMaterial color="#0f172a" flatShading roughness={0.84} transparent opacity={0.86} />
        </mesh>
      ))}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.17, 0.02]} rotation={[0, 0, x > 0 ? -0.55 : 0.55]}>
          <boxGeometry args={[0.055, 0.26, 0.055]} />
          <meshStandardMaterial color="#172033" flatShading roughness={0.84} transparent opacity={0.82} />
        </mesh>
      ))}
      {[0, 1, 2].map((index) => (
        <mesh
          key={index}
          position={[-0.35 + index * 0.26, -0.54, 0.2 - index * 0.18]}
          rotation={[-Math.PI / 2, 0, -0.18 + index * 0.11]}
        >
          <planeGeometry args={[0.18, 0.04]} />
          <meshBasicMaterial color={accent} transparent opacity={0.12 - index * 0.025} />
        </mesh>
      ))}
    </group>
  );
}

function DeskLampShade({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.34, 0]} rotation={[0, 0, 0.08]}>
      <coneGeometry args={[0.22, 0.18, 5]} />
      <meshStandardMaterial
        color="#5b3b22"
        emissive={color}
        emissiveIntensity={0.18}
        flatShading
        roughness={0.54}
      />
    </mesh>
  );
}

function LowPolyPlant({ accent }: { accent: string }) {
  return (
    <group position={[-1.74, -0.52, -0.44]}>
      <mesh>
        <cylinderGeometry args={[0.13, 0.1, 0.18, 6]} />
        <meshStandardMaterial color="#422006" flatShading roughness={0.78} />
      </mesh>
      {Array.from({ length: 5 }, (_, index) => (
        <mesh
          key={index}
          position={[
            Math.sin(index * 1.4) * 0.08,
            0.18 + (index % 2) * 0.04,
            Math.cos(index * 1.4) * 0.05,
          ]}
          rotation={[0.25 + index * 0.1, 0, index * 0.9]}
        >
          <coneGeometry args={[0.045, 0.24, 4]} />
          <meshStandardMaterial
            color={index % 2 ? "#166534" : "#14532d"}
            emissive={accent}
            emissiveIntensity={0.02}
            flatShading
            roughness={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}

function WindowSillObjects({
  active,
  world,
}: {
  active: boolean;
  world: WindowWorld;
}) {
  const rarityStrength = getRarityStrength(world.rarity);

  return (
    <group position={[0.42, -0.52, 0.16]}>
      <mesh>
        <cylinderGeometry args={[0.055, 0.047, 0.08, 6]} />
        <meshStandardMaterial
          color="#3b2418"
          emissive={world.accent}
          emissiveIntensity={active ? 0.06 * rarityStrength : 0.025 * rarityStrength}
          flatShading
          roughness={0.78}
        />
      </mesh>
      {Array.from({ length: 3 }, (_, index) => (
        <mesh
          key={index}
          position={[
            -0.025 + index * 0.025,
            0.09 + index * 0.012,
            Math.cos(index) * 0.012,
          ]}
          rotation={[0.22 + index * 0.08, 0, -0.4 + index * 0.42]}
        >
          <coneGeometry args={[0.022, 0.13, 4]} />
          <meshStandardMaterial
            color={index % 2 ? "#14532d" : "#166534"}
            emissive={world.accent}
            emissiveIntensity={active ? 0.05 * rarityStrength : 0.018 * rarityStrength}
            flatShading
            roughness={0.88}
          />
        </mesh>
      ))}
      <mesh position={[-0.22, -0.015, 0.012]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.2, 0.012, 0.11]} />
        <meshStandardMaterial
          color="#d7c594"
          emissive={world.accent}
          emissiveIntensity={active ? 0.05 * rarityStrength : 0.02 * rarityStrength}
          flatShading
          roughness={0.88}
        />
      </mesh>
    </group>
  );
}

function WallLifeDetails({
  accent,
  world,
}: {
  accent: string;
  world: WindowWorld;
}) {
  return (
    <group>
      <group position={[-2.43, 0.72, -1.48]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.5, 0.34, 0.035]} />
          <meshStandardMaterial color="#2f241c" flatShading roughness={0.78} />
        </mesh>
        <mesh position={[0, 0, 0.022]}>
          <boxGeometry args={[0.4, 0.24, 0.012]} />
          <meshBasicMaterial color={world.skyBottom} transparent opacity={0.62} />
        </mesh>
      </group>
      <group position={[-2.43, 0.42, -0.86]} rotation={[0, Math.PI / 2, 0]}>
        {[
          [-0.18, 0.09, "#d7c594"],
          [0.1, 0.02, "#f7d28a"],
          [-0.02, -0.16, "#cbd5e1"],
        ].map(([x, y, color], index) => (
          <mesh key={index} position={[x as number, y as number, 0]}>
            <boxGeometry args={[0.18, 0.13, 0.012]} />
            <meshStandardMaterial
              color={color as string}
              emissive={accent}
              emissiveIntensity={0.025}
              flatShading
              roughness={0.9}
            />
          </mesh>
        ))}
      </group>
      <group position={[-2.43, 0.98, -0.42]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.76, 0.045, 0.08]} />
          <meshStandardMaterial color="#3b2619" flatShading roughness={0.72} />
        </mesh>
        {[0, 1, 2, 3].map((index) => (
          <mesh
            key={index}
            position={[-0.28 + index * 0.17, 0.08, 0.025]}
            rotation={[0, 0, index % 2 ? 0.08 : -0.04]}
          >
            <boxGeometry args={[0.09, 0.22, 0.07]} />
            <meshStandardMaterial
              color={index % 2 ? "#334155" : "#6b3f25"}
              emissive={accent}
              emissiveIntensity={0.015}
              flatShading
              roughness={0.8}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function TartarExtras({
  accent,
  activeObjectId,
  bindObject,
  onInspectObject,
}: {
  accent: string;
  activeObjectId?: RoomObjectId | null;
  bindObject: ObjectInteractionBinder;
  onInspectObject: (objectId: RoomObjectId) => void;
}) {
  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("terminal");
        }}
        position={[0.32, -0.04, 0.5]}
        rotation={[0.03, -0.22, 0]}
        {...bindObject("terminal")}
      >
        <boxGeometry args={[0.64, 0.42, 0.06]} />
        <meshStandardMaterial
          color="#07111f"
          emissive={accent}
          emissiveIntensity={activeObjectId === "terminal" ? 0.42 : 0.16}
          flatShading
          roughness={0.56}
        />
      </mesh>
      <mesh position={[0.32, -0.29, 0.46]}>
        <boxGeometry args={[0.7, 0.04, 0.34]} />
        <meshStandardMaterial color="#111827" flatShading roughness={0.82} />
      </mesh>
      <mesh position={[0.14, -0.24, 0.92]} rotation={[0, -0.05, 0]}>
        <boxGeometry args={[0.58, 0.035, 0.16]} />
        <meshStandardMaterial color="#0f172a" emissive={accent} emissiveIntensity={0.04} flatShading roughness={0.72} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => (
        <mesh key={index} position={[-0.1 + index * 0.055, -0.205, 0.99]}>
          <boxGeometry args={[0.035, 0.018, 0.035]} />
          <meshStandardMaterial color="#1f2937" flatShading roughness={0.68} />
        </mesh>
      ))}
      <mesh position={[0.72, -0.205, 0.82]}>
        <boxGeometry args={[0.12, 0.025, 0.18]} />
        <meshStandardMaterial color="#111827" emissive={accent} emissiveIntensity={0.025} flatShading roughness={0.72} />
      </mesh>
      <mesh position={[-0.78, -0.05, 0.54]} rotation={[0.02, 0.38, -0.01]}>
        <boxGeometry args={[0.42, 0.28, 0.28]} />
        <meshStandardMaterial color="#1f2937" emissive={accent} emissiveIntensity={0.08} flatShading roughness={0.74} />
      </mesh>
      <mesh position={[-0.78, -0.045, 0.7]} rotation={[0.02, 0.38, -0.01]}>
        <boxGeometry args={[0.3, 0.18, 0.035]} />
        <meshStandardMaterial color="#06130f" emissive="#86efac" emissiveIntensity={0.26} flatShading roughness={0.5} />
      </mesh>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("radio");
        }}
        position={[1.28, -0.18, 0.16]}
        {...bindObject("radio")}
      >
        <boxGeometry args={[0.4, 0.2, 0.28]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive="#ef4444"
          emissiveIntensity={activeObjectId === "radio" ? 0.24 : 0.08}
          flatShading
          roughness={0.64}
        />
      </mesh>
      <mesh position={[1.0, -0.18, 0.04]}>
        <boxGeometry args={[0.3, 0.16, 0.22]} />
        <meshStandardMaterial color="#111827" emissive="#f97316" emissiveIntensity={0.08} flatShading roughness={0.72} />
      </mesh>
      {[0, 1, 2].map((index) => (
        <mesh key={index} position={[0.88 + index * 0.12, -0.08, 0.18]}>
          <boxGeometry args={[0.06, 0.012, 0.012]} />
          <meshBasicMaterial color={index === 1 ? "#f97316" : accent} transparent opacity={0.58} />
        </mesh>
      ))}
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("envelope");
        }}
        position={[-1.48, 1.2, -2.0]}
        {...bindObject("envelope")}
      >
        <boxGeometry args={[0.09, 0.055, 0.035]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={activeObjectId === "envelope" ? 0.74 : 0.32}
          flatShading
        />
      </mesh>
      <BookStack
        accent={accent}
        active={activeObjectId === "envelope"}
        bindObject={bindObject}
        onInspectObject={onInspectObject}
        position={[-1.02, -0.18, 0.08]}
      />
      <mesh position={[-1.32, -0.23, -0.08]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.32, 0.012, 0.18]} />
        <meshStandardMaterial
          color="#d7c594"
          emissive={accent}
          emissiveIntensity={0.035}
          flatShading
          roughness={0.9}
        />
      </mesh>
    </group>
  );
}

function KanaExtras({
  accent,
  activeObjectId,
  bindObject,
  onInspectObject,
}: {
  accent: string;
  activeObjectId?: RoomObjectId | null;
  bindObject: ObjectInteractionBinder;
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
        {...bindObject("envelope")}
      >
        <mesh>
          <boxGeometry args={[0.72, 0.82, 0.16]} />
          <meshStandardMaterial color="#241817" flatShading roughness={0.78} />
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
              flatShading
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
        {...bindObject("terminal")}
      >
        <boxGeometry args={[0.18, 0.34, 0.04]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive={accent}
          emissiveIntensity={activeObjectId === "terminal" ? 0.38 : 0.12}
          flatShading
          roughness={0.72}
        />
      </mesh>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onInspectObject("radio");
        }}
        position={[1.18, -0.2, 0.12]}
        {...bindObject("radio")}
      >
        <cylinderGeometry args={[0.15, 0.15, 0.16, 22]} />
        <meshStandardMaterial
          color="#1f2937"
          emissive={accent}
          emissiveIntensity={activeObjectId === "radio" ? 0.28 : 0.1}
          flatShading
          roughness={0.64}
        />
      </mesh>
      <LowPolyPlant accent={accent} />
      <mesh position={[0.1, -0.19, 0.18]} rotation={[0, 0.1, -0.06]}>
        <boxGeometry args={[0.36, 0.012, 0.22]} />
        <meshStandardMaterial
          color="#f3d1c2"
          emissive={accent}
          emissiveIntensity={0.025}
          flatShading
          roughness={0.88}
        />
      </mesh>
    </group>
  );
}

function RoomObjects({
  action,
  activeObjectId,
  broadcastCandidates,
  hoveredObjectId,
  isPlaying,
  isScreensaver,
  latestEpisode,
  logs,
  onHoverObject,
  onInspectObject,
  subject,
  timeStateLabel,
}: RoomScene3DProps & {
  hoveredObjectId?: RoomObjectId | null;
  onHoverObject: (objectId: RoomObjectId | null) => void;
}) {
  const palette = getPalette(subject);
  const windowWorld = useMemo(() => getWindowWorld(subject), [subject]);
  const [introActive, setIntroActive] = useState(false);
  const actionPulse = 0.04 + (action.id.length % 4) * 0.014;
  const roomRef = useRef<THREE.Group>(null);
  const lampLightRef = useRef<THREE.PointLight>(null);
  const lampBulbRef = useRef<THREE.MeshStandardMaterial>(null);
  const latestLog = logs.find((log) => log.subjectId === subject.id);
  const latestCandidate = broadcastCandidates[0];
  const windowThemeCandidate = useMemo(
    () =>
      createThemeCandidateFromRoomState({
        latestLog,
        subjectId: subject.id,
        window: {
          id: windowWorld.id,
          label: windowWorld.label,
          rain: windowWorld.rain,
          rarity: windowWorld.rarity,
          timeStateLabel,
        },
      }),
    [latestLog, subject.id, timeStateLabel, windowWorld],
  );
  const windowEpisodeSeed = useMemo(
    () =>
      createEpisodeSeedFromThemeCandidate({
        candidate: windowThemeCandidate,
        roomState: {
          latestLog,
          subjectId: subject.id,
          window: {
            id: windowWorld.id,
            label: windowWorld.label,
            rain: windowWorld.rain,
            rarity: windowWorld.rarity,
            timeStateLabel,
          },
        },
      }),
    [latestLog, subject.id, timeStateLabel, windowThemeCandidate, windowWorld],
  );
  const activeBroadcast =
    activeObjectId === "crt" || activeObjectId === "radio";
  const whisperObjectId = hoveredObjectId ?? activeObjectId;
  const objectLabels = useMemo(
    () => new Map(subject.roomObjects.map((object) => [object.id, object.label])),
    [subject.roomObjects],
  );
  const bindObject: ObjectInteractionBinder = (objectId) => ({
    onPointerOut: (event) => {
      event.stopPropagation();
      onHoverObject(null);
    },
    onPointerOver: (event) => {
      event.stopPropagation();
      onHoverObject(objectId);
    },
  });
  const isObjectLit = (objectId: RoomObjectId) =>
    activeObjectId === objectId || hoveredObjectId === objectId;

  useEffect(() => {
    if (subject.id !== "tartar" || typeof window === "undefined") {
      const timer = window.setTimeout(() => setIntroActive(false), 0);

      return () => window.clearTimeout(timer);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setIntroActive(false), 0);

      return () => window.clearTimeout(timer);
    }

    const startTimer = window.setTimeout(() => setIntroActive(true), 0);
    const endTimer = window.setTimeout(() => setIntroActive(false), 5_200);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
    };
  }, [subject.id]);

  useFrame(({ clock, pointer, size }) => {
    const elapsed = clock.getElapsedTime();
    const isNarrow = size.width < 700;

    if (roomRef.current) {
      roomRef.current.rotation.y = Math.sin(elapsed * 0.1) * 0.012 + pointer.x * 0.012;
      roomRef.current.rotation.x = pointer.y * -0.005;
      roomRef.current.position.y = THREE.MathUtils.lerp(
        roomRef.current.position.y,
        isNarrow ? 0.34 : 0,
        0.08,
      );
      roomRef.current.scale.setScalar(isNarrow ? 0.92 : 1);
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
      <fog attach="fog" args={[palette.sky, 3.1, 7.2]} />
      <ambientLight intensity={palette.ambient} />
      <hemisphereLight
        color={windowWorld.accent}
        groundColor="#172033"
        intensity={0.24}
      />
      <directionalLight
        color={windowWorld.accent}
        intensity={activeObjectId === "window" ? 0.74 : 0.46}
        position={[0.6, 2.2, -0.8]}
      />
      <pointLight
        ref={lampLightRef}
        color={palette.lamp}
        decay={2}
        distance={3.65}
        intensity={palette.lampIntensity + 0.32}
        position={[1.18, 0.52, 0.28]}
      />
      <spotLight
        angle={0.72}
        color={palette.lamp}
        decay={2}
        distance={3}
        intensity={activeObjectId === "lamp" ? 0.58 : 0.38}
        penumbra={0.88}
        position={[1.16, 0.86, 0.28]}
        target-position={[0.24, -0.25, 0.56]}
      />
      <pointLight
        color={palette.monitor}
        decay={1.7}
        distance={2.85}
        intensity={0.78 + (activeBroadcast ? 0.34 : 0)}
        position={[-1.34, 0.06, 0.72]}
      />
      <pointLight
        color={palette.monitor}
        decay={2.1}
        distance={1.75}
        intensity={subject.id === "tartar" ? 0.28 : 0.1}
        position={[0.24, -0.14, 0.72]}
      />
      <pointLight
        color={windowWorld.accent}
        decay={2}
        distance={5.8}
        intensity={activeObjectId === "window" ? 0.9 : 0.58}
        position={[0.12, 0.96, -1.76]}
      />

      <group ref={roomRef}>
        <mesh receiveShadow position={[0, -0.9, -0.18]}>
          <boxGeometry args={[5.8, 0.1, 4.7]} />
          <meshStandardMaterial
            color="#101827"
            emissive={windowWorld.accent}
            emissiveIntensity={0.018}
            flatShading
            metalness={0.08}
            roughness={0.54}
          />
        </mesh>
        <mesh receiveShadow position={[0, 0.74, -2.28]}>
          <boxGeometry args={[5.2, 3.35, 0.1]} />
          <meshStandardMaterial color={palette.wall} flatShading roughness={0.94} />
        </mesh>
        <mesh receiveShadow position={[-2.55, 0.68, -0.18]} rotation={[0, 0.1, 0]}>
          <boxGeometry args={[0.1, 3.25, 4.35]} />
          <meshStandardMaterial color="#0d1424" flatShading roughness={0.9} />
        </mesh>
        <mesh receiveShadow position={[2.56, 0.7, -0.18]} rotation={[0, -0.1, 0]}>
          <boxGeometry args={[0.08, 3.25, 4.35]} />
          <meshStandardMaterial color="#11182a" flatShading roughness={0.92} />
        </mesh>
        <WallLifeDetails accent={palette.accent} world={windowWorld} />

        <mesh receiveShadow position={[0.0, -0.36, 0.4]} rotation={[0, -0.035, 0]}>
          <boxGeometry args={[3.92, 0.18, 1.26]} />
          <meshStandardMaterial
            color="#4a2e1d"
            emissive={palette.lamp}
            emissiveIntensity={0.045}
            flatShading
            metalness={0.06}
            roughness={0.48}
          />
        </mesh>
        <mesh position={[-1.62, -0.75, -0.02]}>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color="#24160d" flatShading roughness={0.82} />
        </mesh>
        <mesh position={[1.62, -0.75, 0.02]}>
          <boxGeometry args={[0.11, 0.78, 0.11]} />
          <meshStandardMaterial color="#24160d" flatShading roughness={0.82} />
        </mesh>

        {subject.id === "tartar" ? (
          <group
            onClick={(event) => {
              event.stopPropagation();
              onInspectObject("crt");
            }}
            position={[-1.34, 0.0, 0.34]}
            rotation={[0.05, 0.46, -0.02]}
            {...bindObject("crt")}
          >
            <mesh>
              <boxGeometry args={[0.92, 0.62, 0.5]} />
              <meshStandardMaterial color="#1f2937" flatShading roughness={0.78} />
            </mesh>
            <mesh position={[0, 0.02, 0.32]}>
              <boxGeometry args={[0.68, 0.36, 0.035]} />
              <meshStandardMaterial
                color="#06130f"
                emissive={palette.monitor}
                emissiveIntensity={0.42 + actionPulse + (isObjectLit("crt") ? 0.26 : 0)}
                flatShading
                roughness={0.5}
              />
            </mesh>
            <mesh position={[0.3, -0.18, 0.29]}>
              <sphereGeometry args={[0.025, 12, 8]} />
              <meshStandardMaterial
                color={palette.monitor}
                emissive={palette.monitor}
                emissiveIntensity={0.72}
                flatShading
              />
            </mesh>
          </group>
        ) : null}

        <group
          onClick={(event) => {
            event.stopPropagation();
            onInspectObject("lamp");
          }}
          position={[1.18, -0.06, 0.28]}
          {...bindObject("lamp")}
        >
          <mesh>
            <cylinderGeometry args={[0.07, 0.12, 0.62, 18]} />
            <meshStandardMaterial color="#4b3324" flatShading roughness={0.66} />
          </mesh>
          <DeskLampShade color={palette.lamp} />
          <mesh position={[0, 0.38, 0]}>
            <dodecahedronGeometry args={[0.14, 0]} />
            <meshStandardMaterial
              ref={lampBulbRef}
              color="#fed7aa"
              emissive={palette.lamp}
              emissiveIntensity={isObjectLit("lamp") ? 0.72 : 0.52}
              flatShading
              roughness={0.34}
            />
          </mesh>
        </group>

        <group
          onClick={(event) => {
            event.stopPropagation();
            onInspectObject("window");
          }}
          position={[0.08, 0.82, -2.08]}
          scale={[2.04, 1.86, 1]}
          {...bindObject("window")}
        >
          <WindowFrame active={isObjectLit("window")} world={windowWorld} />
          <mesh>
            <boxGeometry args={[1.42, 1.2, 0.06]} />
            <meshStandardMaterial
              color="#071225"
              emissive={windowWorld.accent}
              emissiveIntensity={isObjectLit("window") ? 0.42 : 0.22}
              flatShading
              roughness={0.6}
            />
          </mesh>
          <mesh position={[0, 0, 0.034]}>
            <boxGeometry args={[1.18, 0.94, 0.025]} />
            <meshBasicMaterial color="#0c1c35" transparent opacity={0.16} />
          </mesh>
          <RainWindow active={isObjectLit("window")} world={windowWorld} />
          <WindowSillObjects active={isObjectLit("window")} world={windowWorld} />
        </group>

        <ClockFace
          accent={palette.accent}
          active={isObjectLit("clock")}
          bindObject={bindObject}
          onInspectObject={onInspectObject}
        />
        <OnAirSign accent={palette.accent} active={activeBroadcast || isPlaying} />

        <LowPolyChair
          accent={palette.accent}
          introActive={introActive}
          subject={subject}
        />
        {subject.id === "tartar" ? (
          <EntryTartarTrace accent={palette.accent} active={introActive} />
        ) : null}

        <DeskClutter
          accent={palette.accent}
          activeMemo={isObjectLit("memo")}
          bindObject={bindObject}
          onInspectObject={onInspectObject}
          subject={subject}
        />
        <LightBloom
          activeBroadcast={activeBroadcast}
          activeWindow={activeObjectId === "window"}
          palette={palette}
          subject={subject}
        />
        <GlowPlane
          color={windowWorld.accent}
          opacity={Math.min(
            0.24,
            (activeObjectId === "window" ? 0.13 : 0.075) * getRarityStrength(windowWorld.rarity),
          )}
          position={[0.1, -0.815, -0.92]}
          rotation={[-Math.PI / 2, 0, -0.2]}
          scale={[3.4, 1.34, 1]}
        />
        <GlowPlane
          color={windowWorld.accent}
          opacity={Math.min(
            0.16,
            (activeObjectId === "window" ? 0.09 : 0.052) * getRarityStrength(windowWorld.rarity),
          )}
          position={[0.08, 0.52, -2.16]}
          rotation={[0, 0, 0]}
          scale={[2.8, 1.8, 1]}
        />

        {subject.id === "tartar" ? (
          <TartarExtras
            accent={palette.accent}
            activeObjectId={hoveredObjectId ?? activeObjectId}
            bindObject={bindObject}
            onInspectObject={onInspectObject}
          />
        ) : (
          <KanaExtras
            accent={palette.accent}
            activeObjectId={hoveredObjectId ?? activeObjectId}
            bindObject={bindObject}
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
      <WindowReadout
        active={activeObjectId === "window"}
        episodeSeed={windowEpisodeSeed}
        themeCandidate={windowThemeCandidate}
        timeStateLabel={timeStateLabel}
        world={windowWorld}
      />
      <RadioReadout
        active={activeObjectId === "radio"}
        episode={latestEpisode}
        isPlaying={isPlaying}
      />
      <ClockReadout active={activeObjectId === "clock"} timeStateLabel={timeStateLabel} />
      <ObjectWhisperLabel
        label={whisperObjectId ? objectLabels.get(whisperObjectId) : undefined}
        objectId={whisperObjectId}
      />
      <DustParticles color={palette.accent} />
    </>
  );
}

export default function RoomScene3D(props: RoomScene3DProps) {
  const [hoveredObjectId, setHoveredObjectId] = useState<RoomObjectId | null>(null);

  return (
    <Canvas
      camera={{ fov: 50, position: cameraTargets.idle.position }}
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
      <RoomObjects
        {...props}
        hoveredObjectId={hoveredObjectId}
        onHoverObject={setHoveredObjectId}
      />
    </Canvas>
  );
}
