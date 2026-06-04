"use client";

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
  return (
    <section className="observation-entry" aria-labelledby="entry-title">
      <div className="observation-entry-clock">NIGHT OBSERVATION ROOM</div>
      <div className="observation-entry-copy">
        <p className="observation-kicker">放課後の知識箱</p>
        <h1 id="entry-title">観察対象を選択してください</h1>
        <p>
          放送は、誰かの夜の行動、考えかけのメモ、言いそびれた疑問から生まれる。
        </p>
      </div>

      <div className="subject-select-grid">
        {subjects.map((subject) => (
          <button
            className={`subject-card subject-card-${subject.id}`}
            key={subject.id}
            onClick={() => onSelectSubject(subject.id)}
            type="button"
          >
            <span>{subject.shortName}</span>
            <strong>{subject.name}の部屋</strong>
            <small>{subject.description}</small>
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
