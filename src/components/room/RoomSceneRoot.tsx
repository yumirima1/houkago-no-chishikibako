"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import {
  BroadcastThemeCandidate,
  ObservationLog,
  ObservationSubject,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";
import { Episode } from "@/data/episodes";
import { RoomFallback2D } from "@/components/room/RoomFallback2D";

const RoomScene3D = dynamic(() => import("@/components/room/RoomScene3D"), {
  loading: () => <div className="room-scene-3d-loading" />,
  ssr: false,
});

type RoomSceneRootProps = {
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

function shouldUse3DScene() {
  if (process.env.NEXT_PUBLIC_OBSERVATION_ROOM_3D === "0") {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }

  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");

  return Boolean(gl);
}

export function RoomSceneRoot({
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
}: RoomSceneRootProps) {
  const [use3DScene, setUse3DScene] = useState(false);

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
        activeObjectId={activeObjectId}
        broadcastCandidates={broadcastCandidates}
        isPlaying={isPlaying}
        isScreensaver={isScreensaver}
        latestEpisode={latestEpisode}
        logs={logs}
        onInspectObject={onInspectObject}
        subject={subject}
        timeStateLabel={timeStateLabel}
      />
    </div>
  );
}
