"use client";

import { Html, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

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
  broadcastLatestEpisode?: Episode;
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

type RoomExportStatus = "idle" | "exporting" | "saved" | "error";
type BroadcastFocusStage = "idle" | "zooming" | "fullscreen" | "closing";

const AUTHORED_WINDOW_SIDE_ROOM_MODEL_URL = "/models/window-side-room-authored.glb?v=editable-exterior-20260614";
const BROADCAST_FOCUS_ZOOM_MS = 920;
const BROADCAST_FOCUS_FADE_MS = 420;

const windowSideLayout = {
  cameraIdleLookAt: [0.16, 0.68, -2.02] as [number, number, number],
  cameraIdlePosition: [-0.26, 0.92, 3.28] as [number, number, number],
  chairFinalPosition: [-0.92, -0.72, 0.86] as [number, number, number],
  chairScale: [0.64, 0.64, 0.64] as [number, number, number],
  chairStartPosition: [-0.56, -0.72, 0.62] as [number, number, number],
  chairRotationY: -0.46,
  crtFallbackScale: [0.72, 0.72, 0.72] as [number, number, number],
  crtPosition: [-1.34, -0.1, -0.04] as [number, number, number],
  crtRotation: [0.05, 0.5, -0.02] as [number, number, number],
  crtScale: [0.96, 0.96, 0.96] as [number, number, number],
  deskLegZ: -0.32,
  deskPosition: [0.04, -0.49, -0.02] as [number, number, number],
  deskSize: [3.72, 0.14, 0.96] as [number, number, number],
  lampPosition: [1.18, -0.16, 0.02] as [number, number, number],
  officeEquipmentPosition: [1.02, -0.255, -0.02] as [number, number, number],
  officeEquipmentRotation: [0.02, -0.36, 0] as [number, number, number],
  officeEquipmentScale: [0.36, 0.36, 0.36] as [number, number, number],
  windowPosition: [0.18, 0.86, -2.16] as [number, number, number],
  windowScale: [2.95, 2.56, 1] as [number, number, number],
};

const cameraTargets: Record<RoomObjectId | "idle", CameraTarget> = {
  idle: {
    lookAt: windowSideLayout.cameraIdleLookAt,
    position: windowSideLayout.cameraIdlePosition,
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
    lookAt: [0.18, 0.92, -2.14],
    position: [-0.02, 0.92, 1.56],
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

function removeExportIgnoredObjects(object: THREE.Object3D) {
  [...object.children].forEach((child) => {
    if (child.name.startsWith("RoomExportIgnore")) {
      object.remove(child);
      return;
    }

    removeExportIgnoredObjects(child);
  });
}

function prepareRoomExportScene(scene: THREE.Scene) {
  const exportScene = scene.clone(true);
  exportScene.name = "WindowSideRoom_exported_from_RoomScene3D";
  removeExportIgnoredObjects(exportScene);

  exportScene.traverse((object) => {
    if (!object.name) {
      object.name = `${object.type}_${object.id}`;
    }

    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });

  return exportScene;
}

function SceneExporter() {
  const { scene } = useThree();
  const [enabled] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return new URLSearchParams(window.location.search).get("exportRoom") === "1";
  });
  const [autoExport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return new URLSearchParams(window.location.search).get("autoExportRoom") === "1";
  });
  const [status, setStatus] = useState<RoomExportStatus>("idle");
  const [message, setMessage] = useState("ready");
  const exportedRef = useRef(false);

  const exportRoom = useCallback(async () => {
    setStatus("exporting");
    setMessage("exporting GLB...");

    try {
      const exportScene = prepareRoomExportScene(scene);
      const exporter = new GLTFExporter();
      const result = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          exportScene,
          (gltf) => {
            if (gltf instanceof ArrayBuffer) {
              resolve(gltf);
              return;
            }

            const json = JSON.stringify(gltf);
            resolve(new TextEncoder().encode(json).buffer);
          },
          (error) => reject(error),
          {
            binary: true,
            includeCustomExtensions: false,
            onlyVisible: true,
            trs: false,
          },
        );
      });

      const response = await fetch("/api/export-room", {
        body: result,
        headers: {
          "content-type": "model/gltf-binary",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Export API returned ${response.status}`);
      }

      const payload = (await response.json()) as { path?: string; size?: number };
      setStatus("saved");
      setMessage(`saved ${payload.path ?? "exported-window-side-room.glb"} (${payload.size ?? result.byteLength} bytes)`);
    } catch (error) {
      console.error("Room export failed.", error);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "unknown export error");
    }
  }, [scene]);

  useEffect(() => {
    if (!enabled || !autoExport || exportedRef.current) {
      return;
    }

    exportedRef.current = true;
    const timer = window.setTimeout(() => {
      void exportRoom();
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [autoExport, enabled, exportRoom]);

  if (!enabled) {
    return null;
  }

  return (
    <Html fullscreen prepend transform={false} zIndexRange={[100, 0]}>
      <div className="room-export-panel">
        <button disabled={status === "exporting"} onClick={() => void exportRoom()} type="button">
          {status === "exporting" ? "Exporting..." : "Export room GLB"}
        </button>
        <span>{message}</span>
      </div>
    </Html>
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
        opacity={activeWindow ? 0.24 : 0.13}
        position={[1.1, -0.79, -1.3]}
        rotation={[-Math.PI / 2, 0, -0.35]}
        scale={[3.45, 1.55, 1]}
      />
      <GlowPlane
        color="#3b82f6"
        opacity={activeWindow ? 0.16 : 0.09}
        position={[1.25, 0.46, -2.12]}
        rotation={[0, -0.08, 0]}
        scale={[2.25, 1.52, 1]}
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

function BroadcastFullscreenOverlay({
  episode,
  onClose,
  stage,
}: {
  episode: Episode;
  onClose: () => void;
  stage: BroadcastFocusStage;
}) {
  if (stage !== "fullscreen" && stage !== "closing") {
    return null;
  }

  return (
    <div
      className={`broadcast-fullscreen ${stage === "closing" ? "is-closing" : "is-open"}`}
    >
      <button
        aria-label="全画面表示を閉じる"
        className="broadcast-fullscreen-close"
        onClick={onClose}
        type="button"
      >
        ×
      </button>
      <div className="broadcast-fullscreen-screen">
          <span>最新話</span>
        <strong>
          {getEpisodeNumberLabel(episode)} {episode.title}
        </strong>
        <p>{episode.description}</p>
        <small>{episode.duration} / {episode.themes.slice(0, 3).join(" / ")}</small>
      </div>
    </div>
  );
}

function BroadcastScreenSurface({
  episode,
  isPlaying,
}: {
  episode: Episode;
  isPlaying: boolean;
}) {
  return (
    <Html
      className="broadcast-tv-screen-anchor is-in-scene"
      distanceFactor={1.08}
      position={[-1.82, 0.52, -0.94]}
      transform
      zIndexRange={[80, 0]}
    >
      <div aria-hidden="true" className="broadcast-tv-screen">
        <span>最新話</span>
        <strong>{getEpisodeNumberLabel(episode)}</strong>
        <p>{episode.title}</p>
        <small>{isPlaying ? "再生中" : `${episode.duration} / 詳しく見る`}</small>
      </div>
    </Html>
  );
}

function InSceneInfoBoards({
  action,
  episode,
  latestCandidate,
  timeStateLabel,
  windowWorld,
}: {
  action: SubjectAction;
  episode: Episode;
  latestCandidate?: BroadcastThemeCandidate;
  timeStateLabel: string;
  windowWorld: WindowWorld;
}) {
  const rainLabel =
    windowWorld.rain === "heavy"
      ? "強い雨"
      : windowWorld.rain === "normal"
        ? "雨"
        : windowWorld.rain === "light"
          ? "細い雨"
          : "静かな夜";

  return (
    <>
      <SceneHtml
        className="scene-episode-board"
        position={[-0.46, 0.36, -0.62]}
        rotation={[0, -0.04, 0]}
      >
        <div>
          <span>EpisodeBoard / 最新話</span>
          <strong>{getEpisodeNumberLabel(episode)} {episode.title}</strong>
          <small>{episode.duration} / テレビ画面をクリックで拡大</small>
        </div>
      </SceneHtml>
      <SceneHtml
        className="scene-info-board"
        position={[1.36, 0.84, -1.66]}
        rotation={[0, 0.04, 0]}
      >
        <div>
          <span>InfoBoard / 窓辺</span>
          <strong>{rainLabel}、街灯、濡れた道路</strong>
          <small>{timeStateLabel} / theme: {latestCandidate?.theme ?? "窓外の観察"}</small>
        </div>
      </SceneHtml>
      <SceneHtml
        className="scene-window-note-board"
        position={[-1.76, 1.02, -1.92]}
        rotation={[0, -0.08, 0]}
      >
        <div>
          <span>WindowNoteBoard</span>
          <strong>{action.thought}</strong>
          <small>{action.broadcastHint}</small>
        </div>
      </SceneHtml>
    </>
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

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("Room GLB failed to load.", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function AuthoredWindowSideRoomModel({
  accent,
  windowAccent,
}: {
  accent: string;
  windowAccent: string;
}) {
  const gltf = useGLTF(AUTHORED_WINDOW_SIDE_ROOM_MODEL_URL);
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    clonedScene.name = "AuthoredWindowSideRoomModel";

    clonedScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = true;

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      const clonedMaterials = materials.map((material) => material.clone());
      object.material = Array.isArray(object.material)
        ? clonedMaterials
        : clonedMaterials[0];

      clonedMaterials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          const materialName = `${object.name} ${material.name}`.toLowerCase();
          if (materialName.includes("exterior")) {
            if (
              materialName.includes("window")
              || materialName.includes("streetlight")
              || materialName.includes("roadreflection")
            ) {
              material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.85);
            } else if (materialName.includes("sky") || materialName.includes("rain")) {
              material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.16);
            } else {
              material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.08);
            }
            return;
          }

          material.emissive = new THREE.Color(
            materialName.includes("window") || materialName.includes("glass")
              ? windowAccent
              : accent,
          );
          material.emissiveIntensity = materialName.includes("window") ? 0.035 : 0.006;
        }
      });
    });

    return clonedScene;
  }, [accent, gltf.scene, windowAccent]);

  return <primitive object={scene} />;
}

function AuthoredRoomHotspots({
  bindObject,
  onInspectObject,
  onOpenBroadcastFocus,
}: {
  bindObject: ObjectInteractionBinder;
  onInspectObject: (objectId: RoomObjectId) => void;
  onOpenBroadcastFocus: () => void;
}) {
  return (
    <group name="AuthoredRoomHotspots">
      {[
        ["crt", "AuthoredTelevisionHotspot", [-1.82, 0.52, -1.02], [0, 0, 0], [1.18, 0.82, 0.24]],
        ["window", "AuthoredWindowHotspot", windowSideLayout.windowPosition, [0, 0, 0], [3.0, 2.28, 0.2]],
        ["lamp", "AuthoredLampHotspot", [1.16, 0.52, -0.58], [0, 0, 0], [0.62, 0.92, 0.62]],
        ["memo", "AuthoredMemoHotspot", [-0.16, 0.2, -0.8], [0, -0.04, 0], [0.78, 0.12, 0.5]],
      ].map(([id, name, position, rotation, scale]) => (
        <mesh
          key={name as string}
          name={name as string}
          onClick={(event) => {
            event.stopPropagation();
            if (id === "crt") {
              onOpenBroadcastFocus();
              return;
            }

            onInspectObject(id as RoomObjectId);
          }}
          position={position as [number, number, number]}
          rotation={rotation as [number, number, number]}
          scale={scale as [number, number, number]}
          {...bindObject(id as RoomObjectId)}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffffff" depthWrite={false} opacity={0} transparent />
        </mesh>
      ))}
    </group>
  );
}

useGLTF.preload(AUTHORED_WINDOW_SIDE_ROOM_MODEL_URL);

function RoomObjects({
  action,
  activeObjectId,
  broadcastCandidates,
  broadcastFocusStage,
  broadcastScreenEpisode,
  hoveredObjectId,
  isPlaying,
  isScreensaver,
  latestEpisode,
  logs,
  onHoverObject,
  onInspectObject,
  onOpenBroadcastFocus,
  subject,
  timeStateLabel,
}: RoomScene3DProps & {
  broadcastFocusStage: BroadcastFocusStage;
  broadcastScreenEpisode: Episode;
  hoveredObjectId?: RoomObjectId | null;
  onHoverObject: (objectId: RoomObjectId | null) => void;
  onOpenBroadcastFocus: () => void;
}) {
  const palette = getPalette(subject);
  const windowWorld = useMemo(() => getWindowWorld(subject), [subject]);
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
    activeObjectId === "crt" || activeObjectId === "radio" || broadcastFocusStage !== "idle";
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
        distance={3.2}
        intensity={palette.lampIntensity + 0.5}
        position={[windowSideLayout.lampPosition[0] + 0.02, 0.18, windowSideLayout.lampPosition[2] + 0.06]}
      />
      <spotLight
        angle={0.58}
        color={palette.lamp}
        decay={2}
        distance={2.8}
        intensity={activeObjectId === "lamp" ? 0.74 : 0.52}
        penumbra={0.94}
        position={[windowSideLayout.lampPosition[0] - 0.02, 0.33, windowSideLayout.lampPosition[2] + 0.02]}
        target-position={[0.18, -0.42, 0.28]}
      />
      <pointLight
        color={palette.monitor}
        decay={1.7}
        distance={2.85}
        intensity={0.78 + (activeBroadcast ? 0.34 : 0)}
        position={[windowSideLayout.crtPosition[0], 0.04, windowSideLayout.crtPosition[2] + 0.28]}
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
        position={[windowSideLayout.windowPosition[0], 0.98, windowSideLayout.windowPosition[2] + 0.28]}
      />

      <group name="WindowSideRoom" ref={roomRef}>
        <ModelErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <AuthoredWindowSideRoomModel
              accent={palette.accent}
              windowAccent={windowWorld.accent}
            />
          </Suspense>
        </ModelErrorBoundary>
        <AuthoredRoomHotspots
          bindObject={bindObject}
          onInspectObject={onInspectObject}
          onOpenBroadcastFocus={onOpenBroadcastFocus}
        />
        {broadcastFocusStage !== "fullscreen" && broadcastFocusStage !== "closing" ? (
          <>
            <BroadcastScreenSurface
              episode={broadcastScreenEpisode}
              isPlaying={isPlaying}
            />
            <InSceneInfoBoards
              action={action}
              episode={broadcastScreenEpisode}
              latestCandidate={latestCandidate}
              timeStateLabel={timeStateLabel}
              windowWorld={windowWorld}
            />
          </>
        ) : null}
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
          position={[0.12, -0.835, -1.08]}
          rotation={[-Math.PI / 2, 0, -0.2]}
          scale={[3.75, 1.08, 1]}
        />
        <GlowPlane
          color={windowWorld.accent}
          opacity={Math.min(
            0.16,
            (activeObjectId === "window" ? 0.09 : 0.052) * getRarityStrength(windowWorld.rarity),
          )}
          position={[0.16, 0.62, -2.18]}
          rotation={[0, 0, 0]}
          scale={[3.3, 2.08, 1]}
        />
      </group>

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
  const [broadcastFocusStage, setBroadcastFocusStage] =
    useState<BroadcastFocusStage>("idle");
  const [hasDismissedBroadcastFocus, setHasDismissedBroadcastFocus] = useState(false);
  const latestBroadcastEpisode = props.broadcastLatestEpisode ?? props.latestEpisode;
  const broadcastScreenEpisode = latestBroadcastEpisode;
  const sceneActiveObjectId =
    broadcastFocusStage !== "idle"
      ? "crt"
      : hasDismissedBroadcastFocus
        ? null
        : props.activeObjectId;

  const openBroadcastFocus = useCallback(() => {
    setHasDismissedBroadcastFocus(false);
    setBroadcastFocusStage("zooming");
  }, []);

  const closeBroadcastFocus = useCallback(() => {
    setBroadcastFocusStage("closing");
    setHasDismissedBroadcastFocus(true);
  }, []);

  useEffect(() => {
    if (broadcastFocusStage !== "zooming") {
      return;
    }

    const timer = window.setTimeout(() => {
      setBroadcastFocusStage("fullscreen");
    }, BROADCAST_FOCUS_ZOOM_MS);

    return () => window.clearTimeout(timer);
  }, [broadcastFocusStage]);

  useEffect(() => {
    if (broadcastFocusStage !== "closing") {
      return;
    }

    const timer = window.setTimeout(() => {
      setBroadcastFocusStage("idle");
    }, BROADCAST_FOCUS_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [broadcastFocusStage]);

  return (
    <>
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
        <CameraRig activeObjectId={sceneActiveObjectId} />
        <RoomObjects
          {...props}
          activeObjectId={sceneActiveObjectId}
          broadcastFocusStage={broadcastFocusStage}
          broadcastScreenEpisode={broadcastScreenEpisode}
          hoveredObjectId={hoveredObjectId}
          onHoverObject={setHoveredObjectId}
          onOpenBroadcastFocus={openBroadcastFocus}
        />
        <SceneExporter />
      </Canvas>
      {props.subject.id === "tartar" ? (
        <BroadcastFullscreenOverlay
          episode={latestBroadcastEpisode}
          onClose={closeBroadcastFocus}
          stage={broadcastFocusStage}
        />
      ) : null}
    </>
  );
}
