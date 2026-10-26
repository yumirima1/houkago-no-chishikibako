"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MONITOR_CAMERA, ROOM_CAMERA, roomCameraPosition } from "./roomMotion";

export function CameraController({ active, focused, reducedMotion }: { active: boolean; focused: boolean; reducedMotion: boolean }) {
  const { camera, gl, pointer, size } = useThree();
  const destination = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(...ROOM_CAMERA.target), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const reset = () => pointer.set(0, 0);
    const surface = gl.domElement;
    surface.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => { surface.removeEventListener("pointerleave", reset); window.removeEventListener("blur", reset); };
  }, [gl, pointer]);
  useFrame((_, delta) => {
    const zoom = focused && !reducedMotion;
    const [x, y, z] = zoom ? MONITOR_CAMERA.position : roomCameraPosition(active ? pointer.x : 0, active ? pointer.y : 0, size.width / size.height, reducedMotion);
    destination.set(x, y, z);
    const [tx, ty, tz] = zoom ? MONITOR_CAMERA.target : ROOM_CAMERA.target;
    target.set(tx, ty, tz);
    camera.position.lerp(destination, 1 - Math.exp(-5 * Math.min(delta, 0.05)));
    lookAt.lerp(target, 1 - Math.exp(-5 * Math.min(delta, 0.05)));
    camera.lookAt(lookAt);
  });
  return null;
}
