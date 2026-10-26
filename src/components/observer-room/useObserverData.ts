"use client";

import { useEffect, useState } from "react";
import { initialObserverData } from "./observerData";
import { ObserverRoomState } from "./types";

export function useObserverData() {
  const [data, setData] = useState<ObserverRoomState>(initialObserverData);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function trySyncBackend() {
      try {
        setIsSyncing(true);
        const res = await fetch("/api/kousatsu", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`API responded with ${res.status}`);
        }

        const snapshot = await res.json();
        if (!isMounted || !snapshot) return;

        // If backend provides real snapshot data, merge it gracefully
        setData((prev) => ({
          ...prev,
          observer: {
            ...prev.observer,
            activity: snapshot.worker?.active ? "gathering" : "thinking",
            activityLabel: snapshot.worker?.active
              ? "自律調査サイクル実行中"
              : prev.observer.activityLabel,
            lastActiveAt: snapshot.worker?.lastSeenAt
              ? new Date(snapshot.worker.lastSeenAt).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : prev.observer.lastActiveAt,
          },
          jobs:
            snapshot.jobs?.length > 0
              ? snapshot.jobs.slice(0, 5).map((j: { id: string; topic: string; stage?: string; status: string; createdAt: string }, idx: number) => ({
                  id: j.id,
                  title: j.topic || `研究ジョブ #${idx + 1}`,
                  stage: j.stage || "進行中",
                  status: (j.status === "running" ? "running" : "completed") as ObserverRoomState["jobs"][0]["status"],
                  timestamp: new Date(j.createdAt).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  progressPercent: j.status === "succeeded" ? 100 : 60,
                }))
              : prev.jobs,
        }));
        setLastSyncError(null);
      } catch (err) {
        if (!isMounted || controller.signal.aborted) return;
        // Backend not ready or offline is totally normal for standalone 3D; fallback to mock data
        setLastSyncError(err instanceof Error ? err.message : "Sync fallback");
      } finally {
        if (isMounted) setIsSyncing(false);
      }
    }

    trySyncBackend();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  return { data, isSyncing, lastSyncError };
}
