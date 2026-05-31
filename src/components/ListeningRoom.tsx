"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioPlayer } from "@/components/AudioPlayer";
import { BackgroundModeOverlay } from "@/components/BackgroundModeOverlay";
import { Clock } from "@/components/Clock";
import { EpisodeList } from "@/components/EpisodeList";
import {
  BackgroundMode,
  RainyNightBackground,
} from "@/components/RainyNightBackground";
import {
  Episode,
  getEpisodeDurationLabel,
  getEpisodeTags,
  getEpisodeType,
  getEpisodeTypeLabel,
  hasPlayableAudio,
} from "@/data/episodes";

const AUTO_HIDE_MS = 30_000;

const backgroundModes: { id: BackgroundMode; label: string }[] = [
  { id: "room", label: "夜の部屋" },
  { id: "desk", label: "デスク" },
  { id: "window", label: "雨の窓" },
];

function blurActiveElement() {
  if (typeof document === "undefined" || typeof HTMLElement === "undefined") {
    return;
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function getNextSundayUpdateLabel() {
  const jstNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
  );
  const next = new Date(jstNow);
  const daysUntilSunday = (7 - next.getDay()) % 7;

  next.setDate(next.getDate() + daysUntilSunday);
  next.setHours(3, 0, 0, 0);

  if (next <= jstNow) {
    next.setDate(next.getDate() + 7);
  }

  return `${next.getFullYear()}年${next.getMonth() + 1}月${next.getDate()}日 03:00`;
}

type FeatureEpisodeCardProps = {
  actionLabel: string;
  episode: Episode;
  label: string;
  onPlay: (episodeId: string) => void;
};

function FeatureEpisodeCard({
  actionLabel,
  episode,
  label,
  onPlay,
}: FeatureEpisodeCardProps) {
  const episodeType = getEpisodeType(episode);

  return (
    <article className="rounded-lg border border-cyan-100/15 bg-slate-950/58 p-5 shadow-2xl shadow-black/25 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/65">
        {label}
      </p>
      <h2 className="mt-3 text-xl font-semibold leading-snug text-slate-50">
        {episode.title}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-cyan-100/20 bg-cyan-100/[0.1] px-2.5 py-1 text-xs text-cyan-50">
          {getEpisodeTypeLabel(episodeType)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs text-slate-300">
          {getEpisodeDurationLabel(episode)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-xs text-slate-300">
          {episode.duration}
        </span>
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-300">
        {episode.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {getEpisodeTags(episode).map((tag) => (
          <span
            className="rounded-full border border-cyan-100/15 bg-cyan-100/10 px-2.5 py-1 text-xs text-cyan-100"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      <button
        className="mt-5 min-h-11 rounded-md border border-cyan-100/20 bg-cyan-100/[0.14] px-4 text-sm font-medium text-cyan-50 transition-colors hover:bg-cyan-100/[0.2] focus:outline-none focus:ring-2 focus:ring-cyan-200/60"
        onClick={() => onPlay(episode.id)}
        type="button"
      >
        {actionLabel}
      </button>
    </article>
  );
}

type ListeningRoomProps = {
  episodes: Episode[];
};

export function ListeningRoom({ episodes }: ListeningRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(episodes[0]?.id);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("room");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [isInterfaceHidden, setIsInterfaceHidden] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [shouldAutoPlayNext, setShouldAutoPlayNext] = useState(false);
  const [nextUpdateLabel, setNextUpdateLabel] = useState<string | null>(null);
  const [isBackgroundOverlayVisible, setIsBackgroundOverlayVisible] =
    useState(true);

  const selectedEpisode = useMemo(
    () =>
      episodes.find((episode) => episode.id === selectedEpisodeId) ??
      episodes[0],
    [episodes, selectedEpisodeId],
  );
  const firstListenEpisode = useMemo(
    () => episodes.find((episode) => episode.id === "episode-000"),
    [episodes],
  );
  const latestEpisode = useMemo(
    () =>
      [...episodes]
        .filter((episode) => episode.id !== firstListenEpisode?.id)
        .filter((episode) => hasPlayableAudio(episode))
        .sort((first, second) =>
          second.publishedAt.localeCompare(first.publishedAt),
        )[0],
    [episodes, firstListenEpisode?.id],
  );
  const listEpisodes = useMemo(
    () =>
      episodes.filter(
        (episode) => episode.id !== firstListenEpisode?.id,
      ),
    [episodes, firstListenEpisode?.id],
  );

  const allTags = useMemo(
    () => [...new Set(episodes.flatMap((episode) => getEpisodeTags(episode)))].sort(),
    [episodes],
  );
  const filteredEpisodes = useMemo(() => {
    if (selectedTags.length === 0) {
      return listEpisodes;
    }

    return listEpisodes.filter((episode) =>
      selectedTags.every((tag) => getEpisodeTags(episode).includes(tag)),
    );
  }, [listEpisodes, selectedTags]);
  const showInterface = !isInterfaceHidden;
  const selectedEpisodeIndex = useMemo(
    () => episodes.findIndex((episode) => episode.id === selectedEpisode.id),
    [episodes, selectedEpisode.id],
  );
  const hasPreviousEpisode = selectedEpisodeIndex > 0;
  const hasNextEpisode =
    selectedEpisodeIndex > -1 && selectedEpisodeIndex < episodes.length - 1;

  const wakeInterface = useCallback(() => {
    setLastInteractionAt(Date.now());
    setIsInterfaceHidden(false);
    setIsBackgroundOverlayVisible(true);
  }, []);

  const markActivity = useCallback(() => {
    if (!isInterfaceHidden) {
      setLastInteractionAt(Date.now());
    }
  }, [isInterfaceHidden]);

  const handlePlaybackChange = useCallback((nextIsPlaying: boolean) => {
    setIsPlaying(nextIsPlaying);
  }, []);

  const handleSeek = useCallback((value: number) => {
    const audio = audioRef.current;

    if (!audio || !hasPlayableAudio(selectedEpisode)) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  }, [selectedEpisode]);

  const seekBy = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;

      if (!audio || !hasPlayableAudio(selectedEpisode)) {
        return;
      }

      const nextTime = Math.min(
        Math.max(0, audio.currentTime + seconds),
        duration || audio.duration || audio.currentTime + seconds,
      );

      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration, selectedEpisode],
  );

  const selectEpisode = useCallback((episodeId: string) => {
    setCurrentTime(0);
    setDuration(0);
    setSelectedEpisodeId(episodeId);
  }, []);

  const playEpisode = useCallback(
    (episodeId: string) => {
      const targetEpisode = episodes.find((episode) => episode.id === episodeId);

      if (targetEpisode && !hasPlayableAudio(targetEpisode)) {
        selectEpisode(episodeId);
        handlePlaybackChange(false);
        wakeInterface();
        return;
      }

      if (episodeId === selectedEpisode.id) {
        void audioRef.current?.play();
        wakeInterface();
        return;
      }

      selectEpisode(episodeId);
      setShouldAutoPlayNext(true);
      wakeInterface();
    },
    [episodes, handlePlaybackChange, selectEpisode, selectedEpisode.id, wakeInterface],
  );

  const goToAdjacentEpisode = useCallback(
    (direction: -1 | 1) => {
      const nextEpisode = episodes[selectedEpisodeIndex + direction];

      if (!nextEpisode) {
        return;
      }

      selectEpisode(nextEpisode.id);
      setShouldAutoPlayNext(isPlaying && hasPlayableAudio(nextEpisode));
      if (!hasPlayableAudio(nextEpisode)) {
        setIsPlaying(false);
      }
      setIsBackgroundOverlayVisible(true);
    },
    [episodes, isPlaying, selectEpisode, selectedEpisodeIndex],
  );

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !hasPlayableAudio(selectedEpisode)) {
      return;
    }

    if (audio.paused) {
      void audio.play();
      return;
    }

    audio.pause();
  }, [selectedEpisode]);

  const handleEpisodeEnded = useCallback(() => {
    const currentIndex = episodes.findIndex(
      (episode) => episode.id === selectedEpisode.id,
    );
    const nextEpisode = episodes
      .slice(currentIndex + 1)
      .find((episode) => hasPlayableAudio(episode));

    setCurrentTime(0);

    if (!nextEpisode) {
      setIsPlaying(false);
      setShouldAutoPlayNext(false);
      return;
    }

    selectEpisode(nextEpisode.id);
    setShouldAutoPlayNext(true);
  }, [episodes, selectEpisode, selectedEpisode.id]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
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
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });
    };
  }, [markActivity]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timer = window.setTimeout(() => {
      blurActiveElement();
      setIsInterfaceHidden(true);
      setIsBackgroundOverlayVisible(true);
    }, AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [isPlaying, lastInteractionAt]);

  useEffect(() => {
    if (!shouldAutoPlayNext) {
      return;
    }

    const timer = window.setTimeout(() => {
      void audioRef.current?.play();
      setShouldAutoPlayNext(false);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [selectedEpisode.id, shouldAutoPlayNext]);

  useEffect(() => {
    if (isInterfaceHidden) {
      blurActiveElement();
    }
  }, [isInterfaceHidden]);

  useEffect(() => {
    if (!isInterfaceHidden) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isInterfaceHidden]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNextUpdateLabel(getNextSundayUpdateLabel());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (!selectedEpisode) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-100">
      <RainyNightBackground mode={backgroundMode} />

      {!showInterface ? (
        <BackgroundModeOverlay
          backgroundMode={backgroundMode}
          currentTime={currentTime}
          duration={duration}
          episode={selectedEpisode}
          hasNextEpisode={hasNextEpisode}
          hasPreviousEpisode={hasPreviousEpisode}
          isPlaying={isPlaying}
          isVisible={isBackgroundOverlayVisible}
          onChangeBackgroundMode={setBackgroundMode}
          onNextEpisode={() => goToAdjacentEpisode(1)}
          onPreviousEpisode={() => goToAdjacentEpisode(-1)}
          onSeek={handleSeek}
          onSeekBy={seekBy}
          onShowInterface={wakeInterface}
          onToggleOverlay={() =>
            setIsBackgroundOverlayVisible((isVisible) => !isVisible)
          }
          onTogglePlayback={togglePlayback}
        />
      ) : null}

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
            <p className="mt-3 text-sm text-cyan-100/75">
              毎週日曜 朝3時更新
              <span className="ml-3 text-slate-500">
                次回更新予定: {nextUpdateLabel ?? "計算中"}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
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
            <button
              className="min-h-10 w-full rounded-lg border border-cyan-100/15 bg-cyan-100/[0.08] px-3 text-sm text-cyan-50 transition-colors hover:bg-cyan-100/[0.13] focus:outline-none focus:ring-2 focus:ring-cyan-200/60 sm:w-auto"
              onClick={() => {
                blurActiveElement();
                setIsBackgroundOverlayVisible(true);
                setIsInterfaceHidden(true);
              }}
              type="button"
            >
              背景モード
            </button>
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
                毎週日曜
                <span className="mt-1 block text-slate-500">朝3時更新</span>
              </div>
              <div className="border-l border-cyan-100/20 pl-4">
                通常回
                <span className="mt-1 block text-slate-500">20-30分想定</span>
              </div>
              <div className="border-l border-cyan-100/20 pl-4">
                特別回
                <span className="mt-1 block text-slate-500">60分前後想定</span>
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
              audioRef={audioRef}
              episode={selectedEpisode}
              onEnded={handleEpisodeEnded}
              onLoadedMetadata={(nextDuration) => setDuration(nextDuration)}
              onPlaybackChange={handlePlaybackChange}
              onTimeUpdate={setCurrentTime}
            />
          </div>
        </section>

        <div className="pb-14">
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {firstListenEpisode ? (
              <FeatureEpisodeCard
                actionLabel="まずこれを再生"
                episode={firstListenEpisode}
                label="まずこれを聴く"
                onPlay={playEpisode}
              />
            ) : null}
            {latestEpisode ? (
              <FeatureEpisodeCard
                actionLabel="最新回を再生"
                episode={latestEpisode}
                label="最新回"
                onPlay={playEpisode}
              />
            ) : null}
          </div>
          <section
            aria-label="タグ検索"
            className="mb-6 rounded-lg border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm"
          >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-slate-100">タグ検索</h2>
              {selectedTags.length > 0 ? (
                <button
                  className="text-left text-sm text-cyan-100 transition-colors hover:text-cyan-50"
                  onClick={() => setSelectedTags([])}
                  type="button"
                >
                  絞り込みを解除
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);

                return (
                  <button
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-200/60 ${
                      isSelected
                        ? "border-cyan-100/40 bg-cyan-100/[0.16] text-cyan-50"
                        : "border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]"
                    }`}
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </section>
          <EpisodeList
            episodes={filteredEpisodes}
            onSelectEpisode={(episodeId) => {
              selectEpisode(episodeId);
              handlePlaybackChange(false);
              wakeInterface();
            }}
            selectedEpisodeId={selectedEpisode.id}
          />
        </div>
      </div>
    </main>
  );
}
