"use client";

import type { CSSProperties } from "react";

import {
  ObservationSubject,
  RoomObjectId,
} from "@/components/observation/observationTypes";

type RoomFallback2DProps = {
  isScreensaver: boolean;
  onInspectObject: (objectId: RoomObjectId) => void;
  subject: ObservationSubject;
};

export function RoomFallback2D({
  isScreensaver,
  onInspectObject,
  subject,
}: RoomFallback2DProps) {
  return (
    <div className="subject-room-scene" aria-hidden="true">
      <div className="room-depth-layer room-depth-layer-back" />
      <div className="room-depth-layer room-depth-layer-mid" />
      <div className="subject-window">
        <span />
        <span />
        <span />
      </div>
      <div className="subject-desk">
        {subject.roomObjects.map((object, index) => (
          <button
            aria-label={`${object.label}を見る`}
            className={`room-object room-object-${object.id}`}
            disabled={isScreensaver}
            key={object.id}
            onClick={(event) => {
              event.stopPropagation();
              onInspectObject(object.id);
            }}
            style={
              { "--object-index": index } as CSSProperties &
                Record<"--object-index", number>
            }
            type="button"
          >
            <span>{object.label}</span>
          </button>
        ))}
      </div>
      <div className="subject-lamp" />
      <div className="subject-avatar">
        <span>{subject.name}</span>
      </div>
      <div className="observation-box-device">観察箱</div>
    </div>
  );
}
