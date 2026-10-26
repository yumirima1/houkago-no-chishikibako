"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ObservationLog, SubjectId } from "@/components/observation/observationTypes";
import {
  appendObservationOperation,
  emptyObservationSnapshot,
  readObservationStorage,
  type ObservationSnapshot,
} from "@/components/observation/observationStorage";
import {
  createObservationLog,
  defaultRelationship,
  getSubjectAction,
} from "@/components/observation/subjectEngine";

function getStorage(): Storage {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    throw new Error("OBSERVATION_STORAGE_UNAVAILABLE");
  }
  return window.localStorage;
}

function readRequestedSubject(): SubjectId | null {
  const requested = new URLSearchParams(window.location.search).get("subject");
  return requested === "tartar" || requested === "kana" ? requested : null;
}

function describeStorageError(error: unknown) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message : "OBSERVATION_STORAGE_FAILED";
}

export function useObservationState() {
  const [snapshot, setSnapshot] = useState<ObservationSnapshot>(emptyObservationSnapshot);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const loaded = useRef(false);
  const current = useRef(snapshot);

  const publish = useCallback((next: ObservationSnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  const recordObservation = useCallback(
    (
      subjectId: SubjectId,
      source: ObservationLog["source"] = "observe",
      action = getSubjectAction(subjectId),
      selectedSubjectId?: SubjectId,
    ) => {
      // Early clicks cannot create an empty replacement for unread history.
      if (!loaded.current) return null;
      const nextLog = createObservationLog({ action, source, subjectId });
      try {
        const next = appendObservationOperation(
          getStorage(), nextLog, selectedSubjectId ?? current.current.selectedSubjectId ?? undefined,
        );
        publish(next);
        setStorageError(next.storageWarning ?? null);
        if (next.storageWarning) {
          loaded.current = false;
          setHydrated(false);
        }
        return nextLog;
      } catch (error) {
        setStorageError(describeStorageError(error));
        return null;
      }
    },
    [publish],
  );

  const selectSubject = useCallback((subjectId: SubjectId) => {
    if (!loaded.current || current.current.selectedSubjectId === subjectId) return null;
    return recordObservation(subjectId, "visit", getSubjectAction(subjectId), subjectId);
  }, [recordObservation]);

  const reloadStoredState = useCallback((requestedSubject: SubjectId | null = null) => {
    try {
      const next = readObservationStorage(getStorage());
      if (requestedSubject) next.selectedSubjectId = requestedSubject;
      publish(next);
      loaded.current = true;
      setHydrated(true);
      setStorageError(null);
    } catch (error) {
      // Read failures are never interpreted as an empty, writable profile.
      loaded.current = false;
      setHydrated(false);
      setStorageError(describeStorageError(error));
    }
  }, [publish]);

  useEffect(() => {
    const timer = window.setTimeout(() => reloadStoredState(readRequestedSubject()), 0);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("houkago.observation.")) reloadStoredState();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      loaded.current = false;
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
    };
  }, [reloadStoredState]);

  const selectedRelationship = useMemo(() => snapshot.selectedSubjectId
    ? snapshot.relationships[snapshot.selectedSubjectId] ?? defaultRelationship
    : defaultRelationship, [snapshot.relationships, snapshot.selectedSubjectId]);

  return {
    ...snapshot,
    hydrated,
    recordObservation,
    reloadStoredState,
    selectSubject,
    selectedRelationship,
    storageError,
  };
}
