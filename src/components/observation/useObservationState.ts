"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ObservationLog,
  Relationship,
  SubjectId,
} from "@/components/observation/observationTypes";
import {
  createObservationLog,
  defaultRelationship,
  getSubjectAction,
  updateRelationship,
} from "@/components/observation/subjectEngine";

const selectedSubjectKey = "houkago.observation.selectedSubject";
const logsKey = "houkago.observation.logs";
const relationshipKey = "houkago.observation.relationships";

type RelationshipMap = Record<SubjectId, Relationship>;

const defaultRelationships: RelationshipMap = {
  kana: defaultRelationship,
  tartar: defaultRelationship,
};

function getStorage() {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRequestedSubject(): SubjectId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const requestedSubject = new URLSearchParams(window.location.search).get(
    "subject",
  );

  return requestedSubject === "tartar" || requestedSubject === "kana"
    ? requestedSubject
    : null;
}

function readJson<T>(key: string, fallback: T): T {
  const storage = getStorage();

  if (!storage) {
    return fallback;
  }

  try {
    const value = storage.getItem(key);

    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(key, JSON.stringify(value));
}

export function useObservationState() {
  const [selectedSubjectId, setSelectedSubjectIdState] =
    useState<SubjectId | null>(null);
  const [logs, setLogs] = useState<ObservationLog[]>([]);
  const [relationships, setRelationships] =
    useState<RelationshipMap>(defaultRelationships);

  const selectedRelationship = useMemo(() => {
    if (!selectedSubjectId) {
      return defaultRelationship;
    }

    return relationships[selectedSubjectId] ?? defaultRelationship;
  }, [relationships, selectedSubjectId]);

  const recordObservation = useCallback(
    (
      subjectId: SubjectId,
      source: ObservationLog["source"] = "observe",
      action = getSubjectAction(subjectId),
    ) => {
      const nextLog = createObservationLog({ action, source, subjectId });

      setLogs((currentLogs) => {
        const nextLogs = [nextLog, ...currentLogs].slice(0, 40);

        writeJson(logsKey, nextLogs);

        return nextLogs;
      });

      setRelationships((currentRelationships) => {
        const nextRelationships = {
          ...currentRelationships,
          [subjectId]: updateRelationship(
            currentRelationships[subjectId] ?? defaultRelationship,
            source,
          ),
        };

        writeJson(relationshipKey, nextRelationships);

        return nextRelationships;
      });

      return nextLog;
    },
    [],
  );

  const selectSubject = useCallback(
    (subjectId: SubjectId) => {
      setSelectedSubjectIdState(subjectId);
      getStorage()?.setItem(selectedSubjectKey, subjectId);
      recordObservation(subjectId, "visit");
    },
    [recordObservation],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedSubject = readRequestedSubject();
      const storedSubject = getStorage()?.getItem(selectedSubjectKey);

      setLogs(readJson<ObservationLog[]>(logsKey, []));
      setRelationships(readJson<RelationshipMap>(relationshipKey, defaultRelationships));

      if (requestedSubject) {
        setSelectedSubjectIdState(requestedSubject);
        return;
      }

      setSelectedSubjectIdState(
        storedSubject === "tartar" || storedSubject === "kana"
          ? storedSubject
          : null,
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return {
    logs,
    recordObservation,
    relationships,
    selectSubject,
    selectedRelationship,
    selectedSubjectId,
  };
}
