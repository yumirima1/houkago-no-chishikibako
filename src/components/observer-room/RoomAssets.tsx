"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { clipCRTFront } from "./crtGeometry";
import { publicAsset } from "./publicAsset";

type ModelProps = {
  name: string;
  kind?: "furniture" | "city";
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number, number];
  height?: number;
  finish?: "wood" | "cream" | "lamp" | "city" | "crt";
  wood?: THREE.Texture;
  rearCut?: number;
};

/** Clone materials only; cached GLB geometry and embedded textures stay shared. */
export function RoomModel({ name, kind = "furniture", position, rotation, size, height, finish, wood, rearCut }: ModelProps) {
  const { scene } = useGLTF(publicAsset(`/assets/observer-room/${kind}/${name}.glb`));
  const width = size?.[0], modelHeight = size?.[1], depth = size?.[2];
  const prepared = useMemo(() => {
    const object = scene.clone(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const bounds = new THREE.Box3().setFromObject(object);
    const dimensions = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = width !== undefined && modelHeight !== undefined && depth !== undefined
      ? new THREE.Vector3(width, modelHeight, depth).divide(dimensions)
      : new THREE.Vector3().setScalar((height ?? dimensions.y) / dimensions.y);
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = kind !== "city";
      node.receiveShadow = true;
      if (rearCut !== undefined) {
        node.geometry = clipCRTFront(node.geometry, center.z + rearCut / scale.z);
        geometries.push(node.geometry);
      }
      const apply = (original: THREE.MeshStandardMaterial) => {
        const material = original.clone();
        materials.push(material);
        material.roughness = 0.78;
        if (finish === "wood" && original.name === "wood") {
          material.color.set("#8c6749"); material.map = wood ?? null;
        } else if (finish === "cream") {
          material.color.set(original.name === "metalDark" ? "#59584f" : original.name === "metal" ? "#242c29" : "#c3b69b");
        } else if (finish === "lamp") {
          material.color.set(original.name === "lamp" ? "#b4a071" : "#344438");
        } else if (finish === "city") material.color.set("#64758b");
        else if (finish === "crt") { material.color.set("#c3b69b"); material.roughness = 0.65; }
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(apply) : apply(node.material);
    });
    object.position.set(-center.x, -bounds.min.y, -center.z);
    return { object, materials, geometries, scale };
  }, [scene, kind, width, modelHeight, depth, height, finish, wood, rearCut]);
  useEffect(() => () => { prepared.materials.forEach((material) => material.dispose()); prepared.geometries.forEach((geometry) => geometry.dispose()); }, [prepared]);
  return <group position={position} rotation={rotation} scale={prepared.scale}><primitive object={prepared.object} dispose={null} /></group>;
}
