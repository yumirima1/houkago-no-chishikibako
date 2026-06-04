"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import {
  ObservationSubject,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";
import { RoomFallback2D } from "@/components/room/RoomFallback2D";

const RoomScene3D = dynamic(() => import("@/components/room/RoomScene3D"), {
  loading: () => <div className="room-scene-3d-loading" />,
  ssr: false,
});

type RoomSceneRootProps = {
  action: SubjectAction;
  isScreensaver: boolean;
  onInspectObject: (objectId: RoomObjectId) => void;
  subject: ObservationSubject;
};

function shouldUse3DScene() {
  if (process.env.NEXT_PUBLIC_OBSERVATION_ROOM_3D === "0") {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RoomSceneRoot({
  action,
  isScreensaver,
  onInspectObject,
  subject,
}: RoomSceneRootProps) {
  const [use3DScene, setUse3DScene] = useState(false);
  const objectDockLabel = useMemo(
    () => `${subject.name}の部屋のものを見る`,
    [subject.name],
  );

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateSceneMode = () => setUse3DScene(shouldUse3DScene());
    const timer = window.setTimeout(updateSceneMode, 0);

    motionQuery.addEventListener("change", updateSceneMode);

    return () => {
      window.clearTimeout(timer);
      motionQuery.removeEventListener("change", updateSceneMode);
    };
  }, []);

  if (!use3DScene) {
    return (
      <RoomFallback2D
        isScreensaver={isScreensaver}
        onInspectObject={onInspectObject}
        subject={subject}
      />
    );
  }

  return (
    <div className="room-scene-root room-scene-root-3d">
      <RoomScene3D
        action={action}
        isScreensaver={isScreensaver}
        subject={subject}
      />
      {!isScreensaver ? (
        <div className="room-object-dock" aria-label={objectDockLabel}>
          {subject.roomObjects.map((object) => (
            <button
              aria-label={`${object.label}を見る`}
              className={`room-object-dock-button room-object-dock-${object.id}`}
              key={object.id}
              onClick={(event) => {
                event.stopPropagation();
                onInspectObject(object.id);
              }}
              type="button"
            >
              <span>{object.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
