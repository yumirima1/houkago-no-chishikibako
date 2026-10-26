"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { ObserverActivityState, TimeOfDay } from "./types";

type StudyLightingProps = {
  timeOfDay: TimeOfDay;
  activity: ObserverActivityState;
};

type LightingPreset = {
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  roomTone: string;
};

const TIME_PRESETS: Record<TimeOfDay, LightingPreset> = {
  morning: {
    ambientColor: "#e6f0fa",
    ambientIntensity: 0.95,
    sunColor: "#fff7e6",
    sunIntensity: 2.2,
    sunPos: [-2.0, 3.2, -4.5],
    roomTone: "#1c2226",
  },
  afternoon: {
    ambientColor: "#edf3f0",
    ambientIntensity: 0.85,
    sunColor: "#fff8ed",
    sunIntensity: 1.8,
    sunPos: [1.5, 3.5, -4.2],
    roomTone: "#181e1d",
  },
  dusk: {
    ambientColor: "#eedbcc",
    ambientIntensity: 0.65,
    sunColor: "#ff9d5c",
    sunIntensity: 1.6,
    sunPos: [3.2, 1.8, -4.5],
    roomTone: "#1e171b",
  },
  night: {
    ambientColor: "#1d2530",
    ambientIntensity: 0.28,
    sunColor: "#5275a1",
    sunIntensity: 0.45,
    sunPos: [0.5, 3.0, -4.2],
    roomTone: "#0f1318",
  },
};

export function StudyLighting({ timeOfDay, activity }: StudyLightingProps) {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);

  const preset = TIME_PRESETS[timeOfDay];

  // 活動状態による補正
  const activityMultiplier = useMemo(() => {
    switch (activity) {
      case "resting":
        return { ambient: 0.5, sun: 0.6 }; // 休息時は部屋を薄暗く
      case "gathering":
        return { ambient: 1.1, sun: 1.0 }; // 情報収集時は見やすく
      case "reading":
        return { ambient: 0.9, sun: 1.0 };
      case "thinking":
      default:
        return { ambient: 1.0, sun: 1.0 };
    }
  }, [activity]);

  // フレームごとのスムーズな色・輝度遷移
  useFrame((_, delta) => {
    const step = Math.min(delta * 2.5, 1);

    if (ambientRef.current) {
      const targetAmbient = new THREE.Color(preset.ambientColor);
      ambientRef.current.color.lerp(targetAmbient, step);
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity,
        preset.ambientIntensity * activityMultiplier.ambient,
        step
      );
    }

    if (sunRef.current) {
      const targetSun = new THREE.Color(preset.sunColor);
      sunRef.current.color.lerp(targetSun, step);
      sunRef.current.intensity = THREE.MathUtils.lerp(
        sunRef.current.intensity,
        preset.sunIntensity * activityMultiplier.sun,
        step
      );
      sunRef.current.position.lerp(new THREE.Vector3(...preset.sunPos), step);
    }
  });

  return (
    <>
      {/* 部屋全体を包む環境光 */}
      <ambientLight
        ref={ambientRef}
        color={preset.ambientColor}
        intensity={preset.ambientIntensity * activityMultiplier.ambient}
      />

      {/* 窓から部屋奥へと差し込む自然の太陽光・月光 */}
      <directionalLight
        ref={sunRef}
        position={preset.sunPos}
        target-position={[0, 0.6, 0]}
        color={preset.sunColor}
        intensity={preset.sunIntensity * activityMultiplier.sun}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />

      {/* 部屋中央のやわらかな間接光 */}
      <pointLight
        position={[0, 2.7, 0.5]}
        intensity={timeOfDay === "night" ? 0.25 : 0.45}
        color="#fff1e0"
        distance={7}
        decay={2}
      />
    </>
  );
}
