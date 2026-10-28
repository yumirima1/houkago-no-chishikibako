"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MONITOR_CAMERA, ROOM_CAMERA, MOBILE_ROOM_CAMERA, roomCameraPosition, roomCameraTarget } from "./roomMotion";

export function CameraController({ active, focused, reducedMotion, stationary = false }: { active: boolean; focused: boolean; reducedMotion: boolean; stationary?: boolean }) {
  const { gl, pointer, size } = useThree();
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
  useFrame(({ camera }, delta) => {
    const zoom = focused && !reducedMotion;
    const [x, y, z] = zoom ? MONITOR_CAMERA.position : roomCameraPosition(active ? pointer.x : 0, active ? pointer.y : 0, size.width / size.height, reducedMotion || stationary);
    destination.set(x, y, z);
    const [tx, ty, tz] = zoom ? MONITOR_CAMERA.target : stationary ? MOBILE_ROOM_CAMERA.target : roomCameraTarget(active ? pointer.x : 0, active ? pointer.y : 0, reducedMotion);
    target.set(tx, ty, tz);
    if (reducedMotion || stationary) { camera.position.copy(destination); lookAt.copy(target); }
    else {
      camera.position.lerp(destination, 1 - Math.exp(-5 * Math.min(delta, 0.05)));
      lookAt.lerp(target, 1 - Math.exp(-5 * Math.min(delta, 0.05)));
    }
    camera.lookAt(lookAt);
    const perspective = camera as THREE.PerspectiveCamera;
    const fov = stationary ? MOBILE_ROOM_CAMERA.fov : ROOM_CAMERA.fov;
    if (perspective.fov !== fov) { perspective.fov = fov; perspective.updateProjectionMatrix(); }
  });
  return null;
}
