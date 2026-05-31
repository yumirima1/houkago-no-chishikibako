"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AudioPlayer } from "@/components/AudioPlayer";
import { Clock } from "@/components/Clock";
import { EpisodeList } from "@/components/EpisodeList";
import {
  BackgroundMode,
  RainyNightBackground,
} from "@/components/RainyNightBackground";
import { Episode } from "@/data/episodes";

const AUTO_HIDE_MS = 30_000;

const backgroundModes: { id: BackgroundMode; label: string }[] = [
  { id: "room", label: "夜の部屋" },
  { id: "desk", label: "デスク" },
  { id: "window", label: "雨の窓" },
];

type ListeningRoomProps = {
  episodes: Episode[];
};

export function ListeningRoom({ episodes }: ListeningRoomProps) {
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(episodes[0]?.id);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("room");
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [isInterfaceHidden, setIsInterfaceHidden] = useState(false);

  const selectedEpisode = useMemo(
    () =>
      episodes.find((episode) => episode.id === selectedEpisodeId) ??
      episodes[0],
    [episodes, selectedEpisodeId],
  );

  const showInterface = !isInterfaceHidden;

  const wakeInterface = useCallback(() => {
    setLastInteractionAt(Date.now());
    setIsInterfaceHidden(false);
  }, []);

  const handlePlaybackChange = useCallback((nextIsPlaying: boolean) => {
    setIsPlaying(nextIsPlaying);

    if (!nextIsPlaying) {
      setIsInterfaceHidden(false);
    }
  }, []);

  useEffect(() => {
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "wheel",
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, wakeInterface, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, wakeInterface);
      });
    };
  }, [wakeInterface]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsInterfaceHidden(true);
    }, AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [isPlaying, lastInteractionAt]);

  if (!selectedEpisode) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-100">
      <RainyNightBackground mode={backgroundMode} />

      <button
        className={`fixed right-5 top-5 z-20 rounded-full border border-white/10 bg-slate-950/55 px-4 py-2 text-sm text-slate-200 backdrop-blur-md transition-opacity hover:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-cyan-200/60 ${
          showInterface
            ? "pointer-events-none opacity-0"
            : "pointer-events-auto opacity-100"
        }`}
        onClick={wakeInterface}
        type="button"
      >
        UIを表示
      </button>

      <div
        className={`mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 transition-opacity duration-700 sm:px-8 lg:px-10 ${
          showInterface
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!showInterface}
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium tracking-[0.28em] text-slate-300">
              放課後の知識箱
            </p>
            <p className="mt-2 text-sm text-slate-500">
              After school knowledge radio
            </p>
          </div>

          <div
            className="flex w-full gap-1 rounded-lg border border-white/10 bg-white/[0.045] p-1 backdrop-blur-md sm:w-auto"
            aria-label="背景モード"
            role="group"
          >
            {backgroundModes.map((mode) => (
              <button
                className={`min-h-10 flex-1 rounded-md px-3 text-sm transition-colors sm:flex-none ${
                  mode.id === backgroundMode
                    ? "bg-cyan-100/[0.16] text-cyan-50"
                    : "text-slate-400 hover:bg-white/[0.08] hover:text-slate-100"
                }`}
                key={mode.id}
                onClick={() => setBackgroundMode(mode.id)}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="max-w-2xl">
            <p className="mb-5 text-sm tracking-[0.28em] text-cyan-100/70">
              RAINY NIGHT / LO-FI AUDIO
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-50 sm:text-6xl">
              放課後の知識箱
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              作業中や寝る前に聞ける、静かな知的ラジオ。理系担当と文系担当が、AI、科学、哲学、言語、宇宙の話をゆっくりほどきます。
            </p>

            <div className="mt-8 grid max-w-xl gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="border-l border-cyan-100/20 pl-4">
                2-20分
                <span className="mt-1 block text-slate-500">短めの会話</span>
              </div>
              <div className="border-l border-cyan-100/20 pl-4">
                AI制作
                <span className="mt-1 block text-slate-500">原稿から音声へ</span>
              </div>
              <div className="border-l border-cyan-100/20 pl-4">
                公開優先
                <span className="mt-1 block text-slate-500">静的データから</span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 backdrop-blur-md">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-slate-500">
                Tokyo time
              </p>
              <Clock />
            </div>
            <AudioPlayer
              episode={selectedEpisode}
              onPlaybackChange={handlePlaybackChange}
            />
          </div>
        </section>

        <div className="pb-14">
          <EpisodeList
            episodes={episodes}
            onSelectEpisode={(episodeId) => {
              setSelectedEpisodeId(episodeId);
              handlePlaybackChange(false);
              wakeInterface();
            }}
            selectedEpisodeId={selectedEpisode.id}
          />
        </div>
      </div>

      <div
        className={`fixed left-5 top-5 z-10 transition-opacity duration-700 ${
          showInterface ? "opacity-0" : "opacity-100"
        }`}
      >
        <p className="mb-2 text-xs uppercase tracking-[0.28em] text-slate-500">
          Tokyo time
        </p>
        <Clock />
      </div>
    </main>
  );
}
