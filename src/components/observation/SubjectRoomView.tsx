"use client";

import { useMemo, useState } from "react";

import { Clock } from "@/components/Clock";
import {
  BroadcastThemeCandidate,
  ObservationLog,
  ObservationSubject,
  RelationshipAtmosphere,
  RoomMode,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";
import { RoomSceneRoot } from "@/components/room/RoomSceneRoot";

function formatLogTime(timestamp: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(timestamp));
}

function formatCandidateDate(timestamp?: string) {
  if (!timestamp) {
    return "記録時刻不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(timestamp));
}

type SubjectRoomViewProps = {
  action: SubjectAction;
  broadcastCandidates: BroadcastThemeCandidate[];
  logs: ObservationLog[];
  mode: Extract<RoomMode, "room" | "screensaver">;
  onEnterRoom: () => void;
  onInspectObject: (objectId: RoomObjectId) => void;
  onRecordDialogue: () => void;
  relationshipAtmosphere: RelationshipAtmosphere;
  subject: ObservationSubject;
};

type RoomObjectDockProps = {
  activeObjectId: RoomObjectId | null;
  onInspectObject: (objectId: RoomObjectId) => void;
  subject: ObservationSubject;
};

function readSeenRoomHints() {
  if (typeof window === "undefined") {
    return { kana: false, tartar: false };
  }

  return {
    kana: window.localStorage.getItem("houkago.roomHint.kana") === "1",
    tartar: window.localStorage.getItem("houkago.roomHint.tartar") === "1",
  };
}

function writeSeenRoomHint(subjectId: ObservationSubject["id"]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`houkago.roomHint.${subjectId}`, "1");
}

function RoomObjectHotspots({
  activeObjectId,
  onInspectObject,
  subject,
}: RoomObjectDockProps) {
  return (
    <div
      className="room-object-hotspots"
      aria-label={`${subject.name}の部屋のものを見る`}
    >
      {subject.roomObjects.map((object) => (
        <button
          aria-label={`${object.label}を見る`}
          className={`room-object-hotspot room-object-hotspot-${object.id} ${
            activeObjectId === object.id ? "is-active" : ""
          }`}
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
  );
}

export function SubjectRoomView({
  action,
  broadcastCandidates,
  logs,
  mode,
  onEnterRoom,
  onInspectObject,
  onRecordDialogue,
  relationshipAtmosphere,
  subject,
}: SubjectRoomViewProps) {
  const [inspectedObjectId, setInspectedObjectId] =
    useState<RoomObjectId | null>(null);
  const [seenRoomHints, setSeenRoomHints] = useState(() => readSeenRoomHints());
  const subjectLogs = logs
    .filter((log) => log.subjectId === subject.id)
    .slice(0, 6);
  const isScreensaver = mode === "screensaver";
  const inspectedObject = subject.roomObjects.find(
    (object) => object.id === inspectedObjectId,
  );
  const latestLog = subjectLogs[0];
  const latestCandidate = broadcastCandidates[0];
  const objectLabels = useMemo(
    () => new Map(subject.roomObjects.map((object) => [object.id, object.label])),
    [subject.roomObjects],
  );
  const showFirstHint = !seenRoomHints[subject.id];

  function markHintSeen() {
    writeSeenRoomHint(subject.id);
    setSeenRoomHints((currentHints) => ({
      ...currentHints,
      [subject.id]: true,
    }));
  }

  function handleInspectObject(objectId: RoomObjectId) {
    setInspectedObjectId(objectId);
    markHintSeen();
    onInspectObject(objectId);
  }

  return (
    <section
      className={`subject-room subject-room-${subject.id} ${
        isScreensaver ? "is-screensaver" : "is-room-mode"
      }`}
      onClick={isScreensaver ? onEnterRoom : undefined}
    >
      <RoomSceneRoot
        action={action}
        activeObjectId={inspectedObjectId}
        isScreensaver={isScreensaver}
        onInspectObject={handleInspectObject}
        subject={subject}
      />

      <div className="subject-room-overlay">
        <header className="subject-room-header">
          <div>
            <p className="observation-kicker">
              {isScreensaver ? "部屋を見る" : "部屋を見る"}
            </p>
            <h1>{subject.name}の部屋</h1>
            <p>{inspectedObject?.description ?? action.mood}</p>
          </div>
          <div className="subject-room-clock">
            <Clock />
            <span>現実時刻同期</span>
          </div>
        </header>

        {isScreensaver ? (
          <div className="screensaver-caption">
            <span>{subject.name}の今</span>
            <strong>{action.thought}</strong>
            <p>{action.ambientCue}</p>
          </div>
        ) : (
          <div className="room-observation-hud">
            {showFirstHint ? (
              <button
                className="room-first-hint"
                onClick={markHintSeen}
                type="button"
              >
                <span>最初だけ</span>
                <strong>部屋の物に触れてみてください。</strong>
                <small>観察対象の日常から、放送テーマが生まれます。</small>
              </button>
            ) : null}

            <aside className="room-reaction-card">
              <p className="observation-kicker">触れたもの</p>
              <h2>{inspectedObject?.label ?? action.label}</h2>
              <p>
                {inspectedObject
                  ? "反応が観察ログに残った。"
                  : "気になる物を選ぶと、ここに反応が残る。"}
              </p>
              <button onClick={onRecordDialogue} type="button">
                ひとことだけ聞く
              </button>
            </aside>

            <div className="room-signal-grid">
              <aside className="room-mini-card">
                <p className="observation-kicker">距離感</p>
                <strong>{relationshipAtmosphere.headline}</strong>
                <span>{relationshipAtmosphere.trustLine}</span>
              </aside>

              <aside className="room-mini-card">
                <p className="observation-kicker">観察ログ</p>
                {latestLog ? (
                  <span>
                    <time>{formatLogTime(latestLog.timestamp)}</time>
                    {latestLog.logText ?? latestLog.thought}
                  </span>
                ) : (
                  <span>まだ何も残っていない。</span>
                )}
              </aside>

              <aside className="room-mini-card">
                <p className="observation-kicker">放送テーマ候補</p>
                {latestCandidate ? (
                  <>
                    <strong>{latestCandidate.theme}</strong>
                    <span>
                      {latestCandidate.objectId
                        ? objectLabels.get(latestCandidate.objectId)
                        : "行動"}
                      {latestCandidate.createdAt
                        ? ` / ${formatCandidateDate(latestCandidate.createdAt)}`
                        : ""}
                    </span>
                  </>
                ) : (
                  <span>観察が増えると、ここに種が出る。</span>
                )}
              </aside>
            </div>

            <ol className="observation-flow-strip" aria-label="放送が生まれる流れ">
              <li className={inspectedObject ? "is-active" : undefined}>観察</li>
              <li className={latestLog ? "is-active" : undefined}>ログ</li>
              <li className={latestCandidate ? "is-active" : undefined}>候補</li>
              <li>放送</li>
            </ol>
          </div>
        )}
      </div>

      {!isScreensaver ? (
        <RoomObjectHotspots
          activeObjectId={inspectedObjectId}
          onInspectObject={handleInspectObject}
          subject={subject}
        />
      ) : null}
    </section>
  );
}
