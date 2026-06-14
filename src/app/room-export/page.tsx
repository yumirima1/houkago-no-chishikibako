"use client";

import dynamic from "next/dynamic";

import {
  getSubjectAction,
  observationSubjects,
} from "@/components/observation/subjectEngine";
import { episodes } from "@/data/episodes";

const RoomScene3D = dynamic(() => import("@/components/room/RoomScene3D"), {
  ssr: false,
});

export default function RoomExportPage() {
  const subject = observationSubjects.tartar;
  const action = getSubjectAction(subject.id);
  const latestEpisode = episodes[0];

  return (
    <main className="room-export-page">
      <RoomScene3D
        action={action}
        activeObjectId="window"
        broadcastCandidates={[
          {
            actionId: action.id,
            actionLabel: action.label,
            count: 1,
            createdAt: new Date().toISOString(),
            exportable: false,
            hint: "Blender export preview",
            id: "room-export-candidate",
            lastObservedAt: new Date().toISOString(),
            mood: action.mood,
            objectId: "window",
            source: "observe",
            sourceLogIds: [],
            subjectId: subject.id,
            theme: "窓辺から放送が生まれる気配",
            timestamp: new Date().toISOString(),
          },
        ]}
        isPlaying
        isScreensaver={false}
        latestEpisode={latestEpisode}
        logs={[]}
        onInspectObject={() => undefined}
        subject={subject}
        timeStateLabel="深夜"
      />
    </main>
  );
}
