"use client";

import type { CSSProperties } from "react";

import { Clock } from "@/components/Clock";
import {
  ObservationLog,
  ObservationSubject,
  Relationship,
  RoomMode,
  RoomObjectId,
  SubjectAction,
} from "@/components/observation/observationTypes";

function formatLogTime(timestamp: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(timestamp));
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="relationship-meter">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

type SubjectRoomViewProps = {
  action: SubjectAction;
  logs: ObservationLog[];
  mode: Extract<RoomMode, "room" | "screensaver">;
  onBackToEntry: () => void;
  onEnterListening: () => void;
  onEnterRoom: () => void;
  onEnterScreensaver: () => void;
  onInspectObject: (objectId: RoomObjectId) => void;
  onRecordDialogue: () => void;
  relationship: Relationship;
  subject: ObservationSubject;
};

export function SubjectRoomView({
  action,
  logs,
  mode,
  onBackToEntry,
  onEnterListening,
  onEnterRoom,
  onEnterScreensaver,
  onInspectObject,
  onRecordDialogue,
  relationship,
  subject,
}: SubjectRoomViewProps) {
  const subjectLogs = logs
    .filter((log) => log.subjectId === subject.id)
    .slice(0, 6);
  const isScreensaver = mode === "screensaver";

  return (
    <section
      className={`subject-room subject-room-${subject.id} ${
        isScreensaver ? "is-screensaver" : "is-room-mode"
      }`}
      onClick={isScreensaver ? onEnterRoom : undefined}
    >
      <div className="subject-room-scene" aria-hidden="true">
        <div className="subject-window">
          <span />
          <span />
          <span />
        </div>
        <div className="subject-desk">
          {subject.roomObjects.slice(0, 4).map((object, index) => (
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
        <div className="observation-box-device">OBS BOX</div>
      </div>

      <div className="subject-room-overlay">
        <header className="subject-room-header">
          <div>
            <p className="observation-kicker">
              {isScreensaver ? "SCREENSAVER / OBSERVE ONLY" : "ROOM MODE"}
            </p>
            <h1>{subject.name}の部屋</h1>
            <p>{subject.mood}</p>
          </div>
          <div className="subject-room-clock">
            <Clock />
            <span>{isScreensaver ? "クリックで部屋へ戻る" : "現実時刻同期"}</span>
          </div>
        </header>

        {isScreensaver ? (
          <div className="screensaver-caption">
            <span>{action.label}</span>
            <strong>{action.thought}</strong>
          </div>
        ) : (
          <div className="room-control-layout">
            <aside className="room-panel">
              <p className="observation-kicker">CURRENT ACTION</p>
              <h2>{action.label}</h2>
              <p>{action.thought}</p>
              <button onClick={onRecordDialogue} type="button">
                ひとこと反応を見る
              </button>
            </aside>

            <aside className="room-panel">
              <p className="observation-kicker">RELATIONSHIP</p>
              <Meter label="trust" value={relationship.trust} />
              <Meter label="friendship" value={relationship.friendship} />
              <Meter label="dependency" value={relationship.dependency} />
            </aside>

            <aside className="room-panel room-log-panel">
              <p className="observation-kicker">OBSERVATION BOX</p>
              <h2>観察ログ</h2>
              {subjectLogs.length > 0 ? (
                <ul>
                  {subjectLogs.map((log) => (
                    <li key={log.id}>
                      <time>{formatLogTime(log.timestamp)}</time>
                      <span>{log.thought}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>まだログはない。部屋のものを見ると残る。</p>
              )}
            </aside>
          </div>
        )}

        {!isScreensaver ? (
          <nav className="room-mode-actions" aria-label="観察モード">
            <button onClick={onBackToEntry} type="button">
              対象を選び直す
            </button>
            <button onClick={onEnterListening} type="button">
              放送を聴く
            </button>
            <button onClick={onEnterScreensaver} type="button">
              眺める
            </button>
            <button onClick={onEnterRoom} type="button">
              部屋を調べる
            </button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
