"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { ROOM_CAMERA, roomCameraPosition } from "./roomMotion";

export function CameraController({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const { camera, gl, pointer, size } = useThree();
  const destination = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const reset = () => pointer.set(0, 0);
    const surface = gl.domElement;
    surface.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    return () => { surface.removeEventListener("pointerleave", reset); window.removeEventListener("blur", reset); };
  }, [gl, pointer]);
  useFrame((_, delta) => {
    destination.set(...roomCameraPosition(active ? pointer.x : 0, active ? pointer.y : 0, size.width / size.height, reducedMotion));
    camera.position.lerp(destination, 1 - Math.exp(-5 * Math.min(delta, 0.05)));
    camera.lookAt(...ROOM_CAMERA.target);
  });
  return null;
}
