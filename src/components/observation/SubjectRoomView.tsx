"use client";

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
  onBackToEntry: () => void;
  onEnterListening: () => void;
  onEnterRoom: () => void;
  onEnterScreensaver: () => void;
  onInspectObject: (objectId: RoomObjectId) => void;
  onRecordDialogue: () => void;
  relationshipAtmosphere: RelationshipAtmosphere;
  subject: ObservationSubject;
};

type RoomObjectDockProps = {
  onInspectObject: (objectId: RoomObjectId) => void;
  subject: ObservationSubject;
};

function RoomObjectDock({ onInspectObject, subject }: RoomObjectDockProps) {
  return (
    <div
      className="room-object-dock"
      aria-label={`${subject.name}の部屋のものを見る`}
    >
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
  );
}

export function SubjectRoomView({
  action,
  broadcastCandidates,
  logs,
  mode,
  onBackToEntry,
  onEnterListening,
  onEnterRoom,
  onEnterScreensaver,
  onInspectObject,
  onRecordDialogue,
  relationshipAtmosphere,
  subject,
}: SubjectRoomViewProps) {
  const subjectLogs = logs
    .filter((log) => log.subjectId === subject.id)
    .slice(0, 6);
  const isScreensaver = mode === "screensaver";
  const objectLabels = new Map(
    subject.roomObjects.map((object) => [object.id, object.label]),
  );

  return (
    <section
      className={`subject-room subject-room-${subject.id} ${
        isScreensaver ? "is-screensaver" : "is-room-mode"
      }`}
      onClick={isScreensaver ? onEnterRoom : undefined}
    >
      <RoomSceneRoot
        action={action}
        isScreensaver={isScreensaver}
        onInspectObject={onInspectObject}
        subject={subject}
      />

      <div className="subject-room-overlay">
        <header className="subject-room-header">
          <div>
            <p className="observation-kicker">
              {isScreensaver ? "SCREENSAVER / OBSERVE ONLY" : "ROOM MODE"}
            </p>
            <h1>{subject.name}の部屋</h1>
            <p>{action.mood}</p>
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
            <p>{action.ambientCue}</p>
          </div>
        ) : (
          <div className="room-control-layout">
            <aside className="room-panel">
              <p className="observation-kicker">CURRENT ACTION</p>
              <h2>{action.label}</h2>
              <p>{action.thought}</p>
              <p className="room-reaction-line">{action.reaction}</p>
              <button onClick={onRecordDialogue} type="button">
                ひとこと反応を見る
              </button>
            </aside>

            <aside className="room-panel room-relationship-panel">
              <p className="observation-kicker">RELATIONSHIP</p>
              <h2>{relationshipAtmosphere.headline}</h2>
              <p>{relationshipAtmosphere.trustLine}</p>
              <p>{relationshipAtmosphere.friendshipLine}</p>
              <p>{relationshipAtmosphere.dependencyLine}</p>
            </aside>

            <aside className="room-panel room-log-panel">
              <p className="observation-kicker">OBSERVATION BOX</p>
              <h2>観察ログ</h2>
              {subjectLogs.length > 0 ? (
                <ul>
                  {subjectLogs.map((log) => (
                    <li key={log.id}>
                      <time>{formatLogTime(log.timestamp)}</time>
                      <span>{log.logText ?? log.thought}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>まだログはない。部屋のものを見ると残る。</p>
              )}
            </aside>

            <aside className="room-panel room-theme-panel">
              <p className="observation-kicker">放送ネタ候補 / BROADCAST HINT</p>
              <h2>放送テーマ候補履歴</h2>
              {broadcastCandidates.length > 0 ? (
                <ul>
                  {broadcastCandidates.map((candidate) => (
                    <li
                      className={
                        candidate.exportable ? "is-exportable" : undefined
                      }
                      key={candidate.id}
                    >
                      <div className="theme-candidate-heading">
                        <strong>{candidate.theme}</strong>
                        {candidate.exportable ? (
                          <em>放送化できそう</em>
                        ) : null}
                      </div>
                      <span>{candidate.hint}</span>
                      <dl>
                        <div>
                          <dt>subject</dt>
                          <dd>{subject.name}</dd>
                        </div>
                        <div>
                          <dt>object</dt>
                          <dd>
                            {candidate.objectId
                              ? objectLabels.get(candidate.objectId)
                              : "行動"}
                          </dd>
                        </div>
                        <div>
                          <dt>action</dt>
                          <dd>{candidate.actionLabel ?? candidate.actionId}</dd>
                        </div>
                        <div>
                          <dt>createdAt</dt>
                          <dd>{formatCandidateDate(candidate.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>count</dt>
                          <dd>{candidate.count ?? 1}</dd>
                        </div>
                      </dl>
                      {candidate.mood ? (
                        <p className="theme-candidate-mood">{candidate.mood}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>観察ログが増えると、ここに放送テーマの種が残る。</p>
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

      {!isScreensaver ? (
        <RoomObjectDock
          onInspectObject={onInspectObject}
          subject={subject}
        />
      ) : null}
    </section>
  );
}
