"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioPlayer } from "@/components/AudioPlayer";
import { AmbientSoundControls } from "@/components/AmbientSoundControls";
import { BgmControls } from "@/components/BgmControls";
import { Clock } from "@/components/Clock";
import { EpisodeList } from "@/components/EpisodeList";
import { BackgroundModeOverlay } from "@/components/BackgroundModeOverlay";
import { BroadcastRoomBackground } from "@/components/background/BroadcastRoomBackground";
import { EntrySubjectSelect } from "@/components/observation/EntrySubjectSelect";
import { SubjectRoomView } from "@/components/observation/SubjectRoomView";
import {
  RoomMode,
  RoomObjectId,
  SubjectId,
} from "@/components/observation/observationTypes";
import {
  getBroadcastThemeCandidates,
  getRelationshipAtmosphere,
  getSubjectAction,
  observationSubjects,
  roomObjectAction,
} from "@/components/observation/subjectEngine";
import { useObservationState } from "@/components/observation/useObservationState";
import {
  BackgroundMode,
  backgroundModeProfiles,
} from "@/components/RainyNightBackground";
import {
  Episode,
  getEpisodeNumberLabel,
  getEpisodeTags,
  hasPlayableAudio,
  isUserVisibleEpisode,
  sortEpisodesForPublicDisplay,
} from "@/data/episodes";
import { useAmbientAudio } from "@/hooks/useAmbientAudio";
import { useBroadcastAmbience } from "@/hooks/useBroadcastAmbience";

const AUTO_HIDE_MS = 30_000;

const backgroundModes: { id: BackgroundMode; label: string }[] =
  backgroundModeProfiles;

function isBackgroundMode(value: string | null): value is BackgroundMode {
  return backgroundModes.some((mode) => mode.id === value);
}

function getInitialBackgroundMode() {
  if (typeof window !== "undefined") {
    const requestedMode = new URLSearchParams(window.location.search).get(
      "background",
    );

    if (isBackgroundMode(requestedMode)) {
      return requestedMode;
    }
  }

  return "room";
}

function getInitialRoomMode(): RoomMode {
  if (typeof window === "undefined") {
    return "entry";
  }

  const params = new URLSearchParams(window.location.search);
  const requestedMode = params.get("mode");
  const requestedSubject = params.get("subject");

  if (requestedMode === "listening") {
    return "listening";
  }

  // Broadcast Background Mode is still the listening surface, not Observation.
  if (requestedMode === "background" || params.get("ambient") === "1") {
    return "background";
  }

  if (
    (requestedSubject === "tartar" || requestedSubject === "kana") &&
    requestedMode === "screensaver"
  ) {
    return "screensaver";
  }

  if (requestedSubject === "tartar" || requestedSubject === "kana") {
    return "room";
  }

  return "entry";
}

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

type ListeningRoomProps = {
  episodes: Episode[];
};

type RoomNavigationMenuProps = {
  isOpen: boolean;
  onEnterBackground: () => void;
  onEnterListening: () => void;
  onEnterRoom: () => void;
  onOpenChange: (isOpen: boolean) => void;
};

function RoomNavigationMenu({
  isOpen,
  onEnterBackground,
  onEnterListening,
  onEnterRoom,
  onOpenChange,
}: RoomNavigationMenuProps) {
  const menuRef = useRef<HTMLElement | null>(null);

  function handleSelect(action: () => void) {
    onOpenChange(false);
    action();
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: Event) {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target)
      ) {
        onOpenChange(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("touchstart", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("touchstart", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <nav className="room-navigation-menu" ref={menuRef} aria-label="部屋の操作">
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
        className="room-menu-trigger"
        onClick={() => onOpenChange(!isOpen)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>

      {isOpen ? (
        <div className="room-menu-panel">
          <button onClick={() => handleSelect(onEnterListening)} type="button">
            放送を聴く
          </button>
          <button onClick={() => handleSelect(onEnterRoom)} type="button">
            部屋を見る
          </button>
          <button onClick={() => handleSelect(onEnterBackground)} type="button">
            背景モード
          </button>
        </div>
      ) : null}
    </nav>
  );
}

export function ListeningRoom({ episodes }: ListeningRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    logs,
    recordObservation,
    selectSubject,
    selectedRelationship,
    selectedSubjectId,
  } = useObservationState();
  const publicEpisodes = useMemo(
    () => sortEpisodesForPublicDisplay(episodes.filter(isUserVisibleEpisode)),
    [episodes],
  );
  const firstListenEpisode = useMemo(
    () => episodes.find((episode) => episode.id === "episode-000"),
    [episodes],
  );
  const latestEpisode = publicEpisodes.find(
    (episode) => episode.id !== firstListenEpisode?.id,
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(
    latestEpisode?.id ?? firstListenEpisode?.id ?? episodes[0]?.id,
  );
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() =>
    getInitialBackgroundMode(),
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [roomMenuState, setRoomMenuState] = useState<{
    isOpen: boolean;
    mode: RoomMode | null;
  }>({ isOpen: false, mode: null });
  const [roomMode, setRoomMode] = useState<RoomMode>(() => getInitialRoomMode());
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [shouldAutoPlayNext, setShouldAutoPlayNext] = useState(false);
  const [nextUpdateLabel] = useState(() => getNextSundayUpdateLabel());
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [isTagPanelOpen, setIsTagPanelOpen] = useState(false);
  const bgm = useAmbientAudio({ isVoicePlaying });
  const ambience = useBroadcastAmbience({ isActive: true });

  const selectedEpisode = useMemo(
    () =>
      episodes.find((episode) => episode.id === selectedEpisodeId) ??
      episodes[0],
    [episodes, selectedEpisodeId],
  );
  const listEpisodes = useMemo(
    () =>
      publicEpisodes.filter(
        (episode) => episode.id !== firstListenEpisode?.id,
      ),
    [firstListenEpisode?.id, publicEpisodes],
  );

  const allTags = useMemo(
    () =>
      [
        ...new Set(publicEpisodes.flatMap((episode) => getEpisodeTags(episode))),
      ].sort(),
    [publicEpisodes],
  );
  const filteredEpisodes = useMemo(() => {
    if (selectedTags.length === 0) {
      return listEpisodes;
    }

    return listEpisodes.filter((episode) =>
      selectedTags.every((tag) => getEpisodeTags(episode).includes(tag)),
    );
  }, [listEpisodes, selectedTags]);
  const selectedSubject = selectedSubjectId
    ? observationSubjects[selectedSubjectId]
    : null;
  const currentSubjectAction = selectedSubject
    ? getSubjectAction(selectedSubject.id, {
        logs,
        relationship: selectedRelationship,
      })
    : null;
  const relationshipAtmosphere = selectedSubject
    ? getRelationshipAtmosphere(selectedSubject.id, selectedRelationship)
    : null;
  const broadcastCandidates = selectedSubject
    ? getBroadcastThemeCandidates(logs, selectedSubject.id)
    : [];
  const isRoomMenuOpen =
    roomMenuState.isOpen && roomMenuState.mode === roomMode;
  const showInterface = roomMode === "listening";

  const setRoomMenuOpen = useCallback(
    (nextIsOpen: boolean) => {
      setRoomMenuState({
        isOpen: nextIsOpen,
        mode: nextIsOpen ? roomMode : null,
      });
    },
    [roomMode],
  );

  const wakeInterface = useCallback(() => {
    setRoomMenuState({ isOpen: false, mode: null });
    setLastInteractionAt(Date.now());
    setRoomMode("listening");
  }, []);

  const enterRoomSelection = useCallback(() => {
    blurActiveElement();
    setRoomMenuState({ isOpen: false, mode: null });
    setRoomMode("entry");
  }, []);

  const enterBackgroundMode = useCallback(() => {
    blurActiveElement();
    setRoomMenuState({ isOpen: false, mode: null });
    setLastInteractionAt(Date.now());
    setRoomMode("background");
  }, []);

  const markActivity = useCallback(() => {
    if (roomMode === "listening") {
      setLastInteractionAt(Date.now());
    }
  }, [roomMode]);

  const handlePlaybackChange = useCallback((nextIsPlaying: boolean) => {
    setIsVoicePlaying(nextIsPlaying);
  }, []);

  const selectEpisode = useCallback((episodeId: string) => {
    setIsVoicePlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSelectedEpisodeId(episodeId);
  }, []);

  const playEpisode = useCallback(
    (episodeId: string) => {
      const targetEpisode = episodes.find((episode) => episode.id === episodeId);

      if (targetEpisode && !hasPlayableAudio(targetEpisode)) {
        selectEpisode(episodeId);
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
    [episodes, selectEpisode, selectedEpisode.id, wakeInterface],
  );

  const toggleSelectedEpisodePlayback = useCallback(() => {
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

  const handleSelectSubject = useCallback(
    (subjectId: SubjectId) => {
      setRoomMenuState({ isOpen: false, mode: null });
      selectSubject(subjectId);
      setRoomMode("room");
    },
    [selectSubject],
  );

  const handleInspectObject = useCallback(
    (objectId: RoomObjectId) => {
      if (!selectedSubject) {
        return;
      }

      const nextAction = roomObjectAction(selectedSubject.id, objectId);

      recordObservation(selectedSubject.id, "room-object", nextAction);

      if (objectId === "crt") {
        setRoomMode("listening");
      }

      if (objectId === "lamp") {
        setBackgroundMode((currentMode) =>
          currentMode === "desk" ? "room" : "desk",
        );
      }
    },
    [recordObservation, selectedSubject],
  );

  const handleRecordDialogue = useCallback(() => {
    if (!selectedSubject || !currentSubjectAction) {
      return;
    }

    recordObservation(selectedSubject.id, "dialogue", currentSubjectAction);
  }, [currentSubjectAction, recordObservation, selectedSubject]);

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
    if (roomMode !== "listening") {
      return;
    }

    const timer = window.setTimeout(() => {
      blurActiveElement();
      if (selectedSubject) {
        setRoomMode("screensaver");
      }
    }, AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [lastInteractionAt, roomMode, selectedSubject]);

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
    if (roomMode === "screensaver") {
      blurActiveElement();
    }
  }, [roomMode]);

  useEffect(() => {
    if (roomMode !== "screensaver") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [roomMode]);

  if (!selectedEpisode) {
    return null;
  }

  const selectedEpisodeNumberLabel = getEpisodeNumberLabel(selectedEpisode);
  const monitorNowPlayingLabel = `${selectedEpisodeNumberLabel} ${selectedEpisode.title}`;

  return (
    <main className="relative min-h-screen overflow-hidden text-slate-100">
      <BroadcastRoomBackground
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#050812]"
        isOnAir={isVoicePlaying}
        mode={backgroundMode}
        nowPlayingLabel={monitorNowPlayingLabel}
      />

      <RoomNavigationMenu
        key={roomMode}
        isOpen={isRoomMenuOpen}
        onEnterBackground={enterBackgroundMode}
        onEnterListening={wakeInterface}
        onEnterRoom={enterRoomSelection}
        onOpenChange={setRoomMenuOpen}
      />

      {roomMode === "background" ? (
        <BackgroundModeOverlay
          ambienceEnabled={ambience.enabled}
          ambienceIsAvailable={ambience.isAvailable}
          ambienceVolumes={ambience.volumes}
          backgroundMode={backgroundMode}
          canPlay={hasPlayableAudio(selectedEpisode)}
          currentTime={currentTime}
          duration={duration}
          episode={selectedEpisode}
          isPlaying={isVoicePlaying}
          onAmbienceEnabledChange={ambience.setEnabled}
          onAmbienceVolumeChange={ambience.setVolume}
          onShowInterface={wakeInterface}
          onTogglePlayback={toggleSelectedEpisodePlayback}
        />
      ) : null}

      {roomMode === "entry" ? (
        <EntrySubjectSelect
          onSelectSubject={handleSelectSubject}
          onStartListening={wakeInterface}
          subjects={Object.values(observationSubjects)}
        />
      ) : null}

      {selectedSubject &&
      currentSubjectAction &&
      relationshipAtmosphere &&
      (roomMode === "room" || roomMode === "screensaver") ? (
        <SubjectRoomView
          action={currentSubjectAction}
          broadcastCandidates={broadcastCandidates}
          logs={logs}
          mode={roomMode}
          onEnterRoom={() => setRoomMode("room")}
          onInspectObject={handleInspectObject}
          onRecordDialogue={handleRecordDialogue}
          relationshipAtmosphere={relationshipAtmosphere}
          subject={selectedSubject}
        />
      ) : null}

      <div
        className={`broadcast-listening-shell relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 transition-opacity duration-[900ms] sm:px-6 lg:px-8 ${
          showInterface ? "is-active" : "is-hidden"
        }`}
        aria-hidden={!showInterface}
      >
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium tracking-[0.28em] text-cyan-100/75">
              NIGHT BROADCAST ROOM
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-50">
              放課後の知識箱
            </p>
            <p className="mt-2 text-sm text-slate-400">
              夜更かしした人が戻ってくる、雨の放送室。
              <span className="mt-1 block text-slate-500 sm:ml-3 sm:inline">
                次回更新予定: {nextUpdateLabel}
              </span>
            </p>
          </div>

          <div className="flex min-w-0 max-w-full flex-col gap-2 sm:items-end">
            <p className="max-w-44 text-right text-xs leading-6 text-slate-500">
              放送と部屋は、右上のメニューから行き来できます。
            </p>
          </div>
        </header>

        <section className="grid min-h-[calc(100vh-6.5rem)] min-w-0 flex-1 items-center gap-5 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(23rem,0.82fr)] lg:py-8">
          <div className="station-first-view min-h-[34rem] min-w-0 rounded-lg border border-white/10 bg-slate-950/22 p-4 backdrop-blur-[2px] sm:p-6 lg:min-h-[42rem]">
            <div className="station-console">
              <div className="station-console-screen">
                <div className="station-console-scanlines" />
                <p className="text-xs tracking-[0.28em] text-emerald-100/60">
                  CRT MONITOR CLOCK
                </p>
                <Clock />
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      isVoicePlaying
                        ? "border-red-200/30 bg-red-500/15 text-red-100"
                        : "border-slate-200/15 bg-slate-200/10 text-slate-300"
                    }`}
                  >
                    {isVoicePlaying ? "● ON AIR" : "OFF AIR"}
                  </span>
                  <span className="rounded-full border border-cyan-100/20 bg-cyan-100/10 px-3 py-1.5 text-xs text-cyan-50">
                    現実時刻同期
                  </span>
                </div>
                <p className="mt-5 text-xs tracking-[0.22em] text-cyan-100/55">
                  NOW PLAYING
                </p>
                <h1 className="mt-2 text-2xl font-semibold leading-tight text-slate-50 sm:text-4xl">
                  {selectedEpisodeNumberLabel}
                  <span className="mt-2 block text-balance">
                    {selectedEpisode.title}
                  </span>
                </h1>
                <p className="mt-4 max-w-xl break-words text-sm leading-7 text-slate-300 sm:text-base">
                  {selectedEpisode.description}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    className="min-h-11 rounded-md border border-cyan-100/25 bg-cyan-100/[0.14] px-4 text-sm font-semibold text-cyan-50 transition-colors hover:bg-cyan-100/[0.2] focus:outline-none focus:ring-2 focus:ring-cyan-200/60"
                    disabled={!hasPlayableAudio(selectedEpisode)}
                    onClick={toggleSelectedEpisodePlayback}
                    type="button"
                  >
                    {isVoicePlaying ? "一時停止" : "放送を聴く"}
                  </button>
                </div>
              </div>

              <div className="station-console-notes">
                <div>
                  <span>ROOM</span>
                  <strong>雨 / CRT / 暖色照明</strong>
                </div>
                <div>
                  <span>LATEST</span>
                  <strong>#017 公開中</strong>
                </div>
                <div>
                  <span>LIST</span>
                  <strong>#018以降は非表示</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <AudioPlayer
              audioRef={audioRef}
              episode={selectedEpisode}
              onEnded={handleEpisodeEnded}
              onLoadedMetadata={(nextDuration) => setDuration(nextDuration)}
              onPlaybackChange={handlePlaybackChange}
              onTimeUpdate={setCurrentTime}
            />
            <BgmControls
              enabled={bgm.enabled}
              isAvailable={bgm.isAvailable}
              onEnabledChange={bgm.setEnabled}
              onVolumeChange={bgm.setVolume}
              volume={bgm.volume}
            />
            <AmbientSoundControls
              enabled={ambience.enabled}
              isAvailable={ambience.isAvailable}
              onEnabledChange={ambience.setEnabled}
              onVolumeChange={ambience.setVolume}
              variant="inline"
              volumes={ambience.volumes}
            />
          </div>
        </section>

        <div className="pb-14 pt-8">
          <section
            aria-label="放送記録の索引"
            className="mb-6 rounded-lg border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  放送記録の索引
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedTags.length > 0
                    ? `${selectedTags.length}件のタグで絞り込み中`
                    : "必要なときだけ開けます"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedTags.length > 0 ? (
                  <button
                    className="min-h-10 rounded-md border border-white/10 bg-white/[0.045] px-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.08]"
                    onClick={() => setSelectedTags([])}
                    type="button"
                  >
                    解除
                  </button>
                ) : null}
                <button
                  aria-expanded={isTagPanelOpen}
                  className="min-h-10 rounded-md border border-cyan-100/20 bg-cyan-100/[0.1] px-3 text-sm text-cyan-50 transition-colors hover:bg-cyan-100/[0.16] focus:outline-none focus:ring-2 focus:ring-cyan-200/60"
                  onClick={() => setIsTagPanelOpen((isOpen) => !isOpen)}
                  type="button"
                >
                  {isTagPanelOpen ? "索引を閉じる" : "索引を開く"}
                </button>
              </div>
            </div>

            {selectedTags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <button
                    className="rounded-full border border-cyan-100/35 bg-cyan-100/[0.14] px-3 py-1.5 text-sm text-cyan-50 transition-colors hover:bg-cyan-100/[0.2] focus:outline-none focus:ring-2 focus:ring-cyan-200/60"
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}

            {isTagPanelOpen ? (
              <div className="mt-4 flex max-h-72 flex-wrap gap-2 overflow-y-auto border-t border-white/10 pt-4">
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
            ) : null}
          </section>
          <EpisodeList
            episodes={filteredEpisodes}
            onSelectEpisode={playEpisode}
            selectedEpisodeId={selectedEpisode.id}
          />
        </div>
      </div>
    </main>
  );
}
