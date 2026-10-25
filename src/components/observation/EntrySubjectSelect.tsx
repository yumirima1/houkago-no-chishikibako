"use client";

import { useRef, useState } from "react";

import {
  ObservationSubject,
  SubjectId,
} from "@/components/observation/observationTypes";

type EntrySubjectSelectProps = {
  onSelectSubject: (subjectId: SubjectId) => void;
  onStartListening: () => void;
  subjects: ObservationSubject[];
};

export function EntrySubjectSelect({
  onSelectSubject,
  onStartListening,
  subjects,
}: EntrySubjectSelectProps) {
  const [enteringSubjectId, setEnteringSubjectId] = useState<SubjectId | null>(
    null,
  );
  const pendingSubjectRef = useRef<SubjectId | null>(null);

  function handleSelectSubject(subjectId: SubjectId) {
    if (pendingSubjectRef.current === subjectId) {
      return;
    }

    pendingSubjectRef.current = subjectId;
    setEnteringSubjectId(subjectId);
    window.setTimeout(() => {
      pendingSubjectRef.current = null;
      onSelectSubject(subjectId);
    }, 80);
  }

  return (
    <section className="observation-entry" aria-labelledby="entry-title">
      <div className="observation-entry-clock">NIGHT ROOM</div>
      <div className="observation-entry-copy">
        <p className="observation-kicker">考察箱</p>
        <h1 id="entry-title">部屋を見る</h1>
        <p>
          放送は、誰かの夜の行動、考えかけのメモ、言いそびれた疑問から生まれる。
        </p>
      </div>

      <div className="subject-select-grid">
        {subjects.map((subject) => (
          <button
            aria-pressed={enteringSubjectId === subject.id}
            className={`subject-card subject-card-${subject.id} ${
              enteringSubjectId === subject.id ? "is-entering" : ""
            }`}
            key={subject.id}
            onClick={() => handleSelectSubject(subject.id)}
            onPointerUp={() => handleSelectSubject(subject.id)}
            type="button"
          >
            <span>{subject.shortName}</span>
            <strong>{subject.name}の部屋を見る</strong>
            <small>{subject.description}</small>
            <em>入室する</em>
          </button>
        ))}
      </div>

      <button
        className="observation-secondary-action"
        onClick={onStartListening}
        type="button"
      >
        先に放送を聴く
      </button>
    </section>
  );
}
