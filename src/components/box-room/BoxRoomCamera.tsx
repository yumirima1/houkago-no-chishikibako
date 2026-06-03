"use client";

import { useFrame } from "@react-three/fiber";
import { MathUtils } from "three";

type BoxRoomCameraProps = {
  enabled?: boolean;
};

export function BoxRoomCamera({ enabled = true }: BoxRoomCameraProps) {
  useFrame(({ camera, clock }) => {
    const elapsed = clock.getElapsedTime();
    const sway = enabled ? Math.sin(elapsed * 0.18) * 0.035 : 0;
    const lift = enabled ? Math.sin(elapsed * 0.13) * 0.018 : 0;

    camera.position.set(
      MathUtils.lerp(camera.position.x, sway, 0.025),
      MathUtils.lerp(camera.position.y, 1.28 + lift, 0.025),
      MathUtils.lerp(camera.position.z, 4.85, 0.025),
    );
    camera.lookAt(0, 0.2, 0);
  });

  return null;
}
