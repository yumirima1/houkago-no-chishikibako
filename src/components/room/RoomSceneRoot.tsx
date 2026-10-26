"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";

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
  loading: () => <WindowSideSceneLoading />,
  ssr: false,
});

type RoomSceneRootProps = {
  action: SubjectAction;
  activeObjectId?: RoomObjectId | null;
  broadcastCandidates: BroadcastThemeCandidate[];
  broadcastLatestEpisode?: Episode;
  isPlaying: boolean;
  isScreensaver: boolean;
  latestEpisode: Episode;
  logs: ObservationLog[];
  onInspectObject: (objectId: RoomObjectId) => void;
  quality?: "low" | "high";
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

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

function WindowSideSceneLoading() {
  return (
    <div className="window-side-scene-loading" aria-label="窓辺を読み込み中">
      <div className="window-side-loading-window">
        <span />
        <span />
      </div>
      <div className="window-side-loading-desk" />
      <div className="window-side-loading-light" />
    </div>
  );
}

class RoomSceneBoundary extends Component<{children: ReactNode; fallback: ReactNode}, {failed: boolean}> {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  render() {
    return this.state.failed ? <>
      {this.props.fallback}
      <div className="room-scene-recovery" role="status">
        3Dを読み込めませんでした。2D表示で部屋の操作を続けられます。
        <button type="button" onClick={()=>this.setState({failed:false})}>3Dを再試行</button>
      </div>
    </> : this.props.children;
  }
}

export function RoomSceneRoot({
  action,
  activeObjectId,
  broadcastCandidates,
  broadcastLatestEpisode,
  isPlaying,
  isScreensaver,
  latestEpisode,
  logs,
  onInspectObject,
  quality = "high",
  subject,
  timeStateLabel,
}: RoomSceneRootProps) {
  const [use3DScene, setUse3DScene] = useState<boolean | null>(null);

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

  if (use3DScene === null) {
    return <WindowSideSceneLoading />;
  }

  if (use3DScene === false) {
    return (
      <RoomFallback2D
        isScreensaver={isScreensaver}
        onInspectObject={onInspectObject}
        subject={subject}
      />
    );
  }

  return (
    <RoomSceneBoundary fallback={<RoomFallback2D isScreensaver={isScreensaver} onInspectObject={onInspectObject} subject={subject} />}>
    <div className="room-scene-root room-scene-root-3d">
      <RoomScene3D
        action={action}
        activeObjectId={activeObjectId}
        broadcastCandidates={broadcastCandidates}
        broadcastLatestEpisode={broadcastLatestEpisode}
        isPlaying={isPlaying}
        isScreensaver={isScreensaver}
        latestEpisode={latestEpisode}
        logs={logs}
        onInspectObject={onInspectObject}
        quality={quality}
        subject={subject}
        timeStateLabel={timeStateLabel}
      />
    </div>
    </RoomSceneBoundary>
  );
}
