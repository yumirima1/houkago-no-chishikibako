"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AmbientSoundControls } from "@/components/AmbientSoundControls";
import { BackgroundModeOverlay } from "@/components/BackgroundModeOverlay";
import { BgmControls } from "@/components/BgmControls";
import { Clock } from "@/components/Clock";
import { EpisodeList } from "@/components/EpisodeList";
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

const AUTO_HIDE_MS = 45_000;

const backgroundModes: { id: BackgroundMode; label: string }[] =
  backgroundModeProfiles;

type ListeningRoomProps = {
  episodes: Episode[];
};

type RoomPanel = "broadcast" | "terminal" | "memo" | "mood" | "clock" | null;
type MobileBoxMode = "observation" | "knowledge";

const MOBILE_BOX_STORAGE_KEY = "houkago.mobileBoxMode";

type RoomNavigationMenuProps = {
  isOpen: boolean;
  onEnterBackground: () => void;
  onEnterListening: () => void;
  onEnterSubject: (subjectId: SubjectId) => void;
  onOpenChange: (isOpen: boolean) => void;
};

function isBackgroundMode(value: string | null): value is BackgroundMode {
  return backgroundModes.some((mode) => mode.id === value);
}

function getInitialBackgroundMode() {
  if (typeof window === "undefined") {
    return "room";
  }

  const requestedMode = new URLSearchParams(window.location.search).get(
    "background",
  );

  return isBackgroundMode(requestedMode) ? requestedMode : "room";
}

function getInitialRoomMode(): RoomMode {
  if (typeof window === "undefined") {
    return "room";
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get("mode") === "listening") {
    return "listening";
  }

  if (params.get("mode") === "background" || params.get("ambient") === "1") {
    return "background";
  }

  if (params.get("mode") === "screensaver") {
    return "screensaver";
  }

  return "room";
}

function getInitialMobileBoxMode(): MobileBoxMode {
  if (typeof window === "undefined") {
    return "knowledge";
  }

  return window.localStorage.getItem(MOBILE_BOX_STORAGE_KEY) === "observation"
    ? "observation"
    : "knowledge";
}

function getRequestedSubject(): SubjectId {
  if (typeof window === "undefined") {
    return "tartar";
  }

  const requestedSubject = new URLSearchParams(window.location.search).get(
    "subject",
  );

  return requestedSubject === "kana" ? "kana" : "tartar";
}

function blurActiveElement() {
  if (typeof document === "undefined" || typeof HTMLElement === "undefined") {
    return;
  }

  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function formatLogTime(timestamp: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(timestamp));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function getTimeStateLabel() {
  const hour = Number(
    new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Tokyo",
    }).format(new Date()),
  );

  if (hour >= 5 && hour < 17) {
    return "朝";
  }

  if (hour >= 17 && hour < 22) {
    return "夕方";
  }

  if (hour >= 0 && hour < 4) {
    return "深夜";
  }

  return "夜";
}

function RoomNavigationMenu({
  isOpen,
  onEnterBackground,
  onEnterListening,
  onEnterSubject,
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

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
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
            放送室
          </button>
          <button
            onClick={() => handleSelect(() => onEnterSubject("tartar"))}
            type="button"
          >
            タルタルの部屋
          </button>
          <button
            onClick={() => handleSelect(() => onEnterSubject("kana"))}
            type="button"
          >
            かなの部屋
          </button>
          <button onClick={() => handleSelect(onEnterBackground)} type="button">
            背景モード
          </button>
        </div>
      ) : null}
    </nav>
  );
}

function MobileBoxSwitcher({
  mode,
  onModeChange,
}: {
  mode: MobileBoxMode;
  onModeChange: (mode: MobileBoxMode) => void;
}) {
  return (
    <div className="mobile-box-switcher" aria-label="箱を切り替える">
      <button
        className={mode === "observation" ? "is-active" : undefined}
        onClick={() => onModeChange("observation")}
        type="button"
      >
        観察箱
      </button>
      <button
        className={mode === "knowledge" ? "is-active" : undefined}
        onClick={() => onModeChange("knowledge")}
        type="button"
      >
        知識箱
      </button>
    </div>
  );
}

function ObservationBoxPanel() {
  return (
    <section className="observation-box-panel" aria-label="観察箱">
      <div>
        <span>観察箱</span>
        <h1>準備中</h1>
        <p>ここに観察ログ・部屋・対象切り替えを統合予定</p>
      </div>
    </section>
  );
}

function MobileKnowledgeBoxPanel({
  allTags,
  currentTime,
  duration,
  episode,
  episodes,
  isPlaying,
  onSelectEpisode,
  onTogglePlayback,
  onToggleTag,
  progress,
  selectedEpisodeNumberLabel,
  selectedTags,
}: {
  allTags: string[];
  currentTime: number;
  duration: number;
  episode: Episode;
  episodes: Episode[];
  isPlaying: boolean;
  onSelectEpisode: (episodeId: string) => void;
  onTogglePlayback: () => void;
  onToggleTag: (tag: string) => void;
  progress: number;
  selectedEpisodeNumberLabel: string;
  selectedTags: string[];
}) {
  const canPlay = hasPlayableAudio(episode);

  return (
    <section className="mobile-knowledge-box" aria-label="知識箱">
      <div className="mobile-knowledge-player">
        <span className={isPlaying ? "is-live" : ""}>
          {isPlaying ? "ON AIR" : "知識箱"}
        </span>
        <h1>
          {selectedEpisodeNumberLabel} {episode.title}
        </h1>
        <p>{episode.description}</p>

        {canPlay ? (
          <div className="room-audio-controls">
            <button
              className={isPlaying ? "is-playing" : undefined}
              onClick={onTogglePlayback}
              type="button"
            >
              {isPlaying ? "一時停止" : "再生"}
            </button>
            <span>{isPlaying ? "再生中" : "待機中"} / #037まで公開中</span>
          </div>
        ) : (
          <p>この回は準備中です。</p>
        )}

        <div className="room-progress">
          <span>{formatTime(currentTime)}</span>
          <i>
            <b style={{ width: `${progress}%` }} />
          </i>
          <span>{duration ? formatTime(duration) : episode.duration}</span>
        </div>
      </div>

      <div className="mobile-knowledge-scroll">
        <div className="room-tag-strip">
          {allTags.slice(0, 14).map((tag) => (
            <button
              className={selectedTags.includes(tag) ? "is-active" : undefined}
              key={tag}
              onClick={() => onToggleTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>

        <EpisodeList
          episodes={episodes}
          onSelectEpisode={onSelectEpisode}
          selectedEpisodeId={episode.id}
        />
      </div>
    </section>
  );
}

export function ListeningRoom({ episodes }: ListeningRoomProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMobileViewport = useIsMobileViewport();
  const {
    logs,
    recordObservation,
    selectSubject,
    selectedRelationship,
    selectedSubjectId,
  } = useObservationState();
  const [fallbackSubjectId] = useState<SubjectId>(() => getRequestedSubject());
  const [roomMode, setRoomMode] = useState<RoomMode>(() => getInitialRoomMode());
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() =>
    getInitialBackgroundMode(),
  );
  const [activeObjectId, setActiveObjectId] = useState<RoomObjectId | null>(
    () =>
      roomMode === "listening"
        ? getRequestedSubject() === "kana"
          ? "radio"
          : "crt"
        : null,
  );
  const [activePanel, setActivePanel] = useState<RoomPanel>(
    roomMode === "listening" ? "broadcast" : null,
  );
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [mobileBoxMode, setMobileBoxMode] = useState<MobileBoxMode>(() =>
    getInitialMobileBoxMode(),
  );
  const [shouldAutoPlayNext, setShouldAutoPlayNext] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const bgm = useAmbientAudio({ isVoicePlaying });
  const ambience = useBroadcastAmbience({ isActive: true });

  const effectiveSubjectId = selectedSubjectId ?? fallbackSubjectId;
  const selectedSubject = observationSubjects[effectiveSubjectId];
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
  const currentSubjectAction = getSubjectAction(selectedSubject.id, {
    logs,
    relationship: selectedRelationship,
  });
  const relationshipAtmosphere = getRelationshipAtmosphere(
    selectedSubject.id,
    selectedRelationship,
  );
  const broadcastCandidates = getBroadcastThemeCandidates(
    logs,
    selectedSubject.id,
  );
  const subjectLogs = logs
    .filter((log) => log.subjectId === selectedSubject.id)
    .slice(0, 8);
  const selectedObject = activeObjectId
    ? selectedSubject.roomObjects.find((object) => object.id === activeObjectId)
    : null;
  const broadcastEntryObjectId = selectedSubject.roomObjects.some(
    (object) => object.id === "crt",
  )
    ? "crt"
    : "radio";

  const wakeRoom = useCallback(() => {
    setLastInteractionAt(Date.now());
    if (roomMode === "screensaver") {
      setRoomMode("room");
    }
  }, [roomMode]);

  const enterSubjectRoom = useCallback(
    (subjectId: SubjectId) => {
      blurActiveElement();
      selectSubject(subjectId);
      setActiveObjectId(null);
      setActivePanel(null);
      setRoomMode("room");
      setLastInteractionAt(Date.now());
    },
    [selectSubject],
  );

  const enterListeningRoom = useCallback(() => {
    blurActiveElement();
    if (!selectedSubjectId) {
      selectSubject(effectiveSubjectId);
    }
    setActiveObjectId(broadcastEntryObjectId);
    setActivePanel("broadcast");
    setRoomMode("listening");
    setLastInteractionAt(Date.now());
  }, [
    broadcastEntryObjectId,
    effectiveSubjectId,
    selectSubject,
    selectedSubjectId,
  ]);

  const enterBackgroundMode = useCallback(() => {
    blurActiveElement();
    if (!selectedSubjectId) {
      selectSubject(effectiveSubjectId);
    }
    setActiveObjectId("window");
    setActivePanel(null);
    setRoomMode("background");
    setLastInteractionAt(Date.now());
  }, [effectiveSubjectId, selectSubject, selectedSubjectId]);

  const selectEpisode = useCallback((episodeId: string) => {
    setIsVoicePlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSelectedEpisodeId(episodeId);
  }, []);

  const playSelectedAudio = useCallback(() => {
    const playback = audioRef.current?.play();

    if (playback) {
      void playback.catch(() => setIsVoicePlaying(false));
    }
  }, []);

  const playEpisode = useCallback(
    (episodeId: string) => {
      const targetEpisode = episodes.find((episode) => episode.id === episodeId);

      if (targetEpisode && !hasPlayableAudio(targetEpisode)) {
        selectEpisode(episodeId);
        enterListeningRoom();
        return;
      }

      if (episodeId === selectedEpisode.id) {
        playSelectedAudio();
        enterListeningRoom();
        return;
      }

      selectEpisode(episodeId);
      setShouldAutoPlayNext(true);
      enterListeningRoom();
    },
    [
      enterListeningRoom,
      episodes,
      playSelectedAudio,
      selectEpisode,
      selectedEpisode.id,
    ],
  );

  const toggleSelectedEpisodePlayback = useCallback(() => {
    const audio = audioRef.current;

    if (!audio || !hasPlayableAudio(selectedEpisode)) {
      return;
    }

    if (audio.paused) {
      playSelectedAudio();
      return;
    }

    audio.pause();
  }, [playSelectedAudio, selectedEpisode]);

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

  const handleInspectObject = useCallback(
    (objectId: RoomObjectId) => {
      const nextAction = roomObjectAction(selectedSubject.id, objectId);

      wakeRoom();
      setActiveObjectId(objectId);
      recordObservation(selectedSubject.id, "room-object", nextAction);

      if (objectId === "crt" || objectId === "radio") {
        setActivePanel("broadcast");
        setRoomMode("listening");
        return;
      }

      if (objectId === "terminal") {
        setActivePanel("terminal");
        setRoomMode("room");
        return;
      }

      if (objectId === "memo" || objectId === "envelope") {
        setActivePanel("memo");
        setRoomMode("room");
        return;
      }

      if (objectId === "window") {
        setBackgroundMode("window");
        setActivePanel("clock");
        setRoomMode("room");
        return;
      }

      if (objectId === "lamp") {
        setBackgroundMode((currentMode) =>
          currentMode === "desk" ? "room" : "desk",
        );
        setActivePanel("mood");
        setRoomMode("room");
        return;
      }

      if (objectId === "clock") {
        setActivePanel("clock");
        setRoomMode("room");
      }
    },
    [recordObservation, selectedSubject.id, wakeRoom],
  );

  const handleRecordDialogue = useCallback(() => {
    wakeRoom();
    recordObservation(selectedSubject.id, "dialogue", currentSubjectAction);
    setActivePanel("memo");
  }, [currentSubjectAction, recordObservation, selectedSubject.id, wakeRoom]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
  }, []);

  const changeMobileBoxMode = useCallback(
    (nextMode: MobileBoxMode) => {
      setMobileBoxMode(nextMode);
      window.localStorage.setItem(MOBILE_BOX_STORAGE_KEY, nextMode);
      setLastInteractionAt(Date.now());

      if (nextMode === "knowledge") {
        if (!selectedSubjectId) {
          selectSubject(effectiveSubjectId);
        }

        setActiveObjectId(broadcastEntryObjectId);
        setActivePanel("broadcast");
        setRoomMode("listening");
        return;
      }

      setActiveObjectId(null);
      setActivePanel(null);
      setRoomMode("room");
    },
    [
      broadcastEntryObjectId,
      effectiveSubjectId,
      selectSubject,
      selectedSubjectId,
    ],
  );

  useEffect(() => {
    if (!selectedSubjectId && roomMode !== "background") {
      selectSubject(effectiveSubjectId);
    }
  }, [effectiveSubjectId, roomMode, selectSubject, selectedSubjectId]);

  useEffect(() => {
    if (!isMobileViewport) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (mobileBoxMode === "knowledge") {
        if (!selectedSubjectId) {
          selectSubject(effectiveSubjectId);
        }

        setActiveObjectId(broadcastEntryObjectId);
        setActivePanel("broadcast");
        setRoomMode("listening");
        return;
      }

      setActiveObjectId(null);
      setActivePanel(null);
      setRoomMode("room");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    broadcastEntryObjectId,
    effectiveSubjectId,
    isMobileViewport,
    mobileBoxMode,
    selectSubject,
    selectedSubjectId,
  ]);

  useEffect(() => {
    if (isMobileViewport && mobileBoxMode === "knowledge") {
      return;
    }

    if (roomMode !== "room" && roomMode !== "listening") {
      return;
    }

    const timer = window.setTimeout(() => {
      blurActiveElement();
      setRoomMode("screensaver");
      setActivePanel(null);
    }, AUTO_HIDE_MS);

    return () => window.clearTimeout(timer);
  }, [isMobileViewport, lastInteractionAt, mobileBoxMode, roomMode]);

  useEffect(() => {
    if (!shouldAutoPlayNext) {
      return;
    }

    const timer = window.setTimeout(() => {
      playSelectedAudio();
      setShouldAutoPlayNext(false);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [playSelectedAudio, selectedEpisode.id, shouldAutoPlayNext]);

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
  const displayDuration = duration > 0 ? duration : 0;
  const progress = displayDuration
    ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))
    : 0;
  const isBackground = roomMode === "background";
  const isMobileObservationBox =
    isMobileViewport && mobileBoxMode === "observation";
  const isMobileKnowledgeBox = isMobileViewport && mobileBoxMode === "knowledge";
  const selectedEpisodeHasAudio = hasPlayableAudio(selectedEpisode);

  return (
    <main className="night-observation-shell min-h-screen text-slate-100">
      <RoomNavigationMenu
        isOpen={isMenuOpen}
        onEnterBackground={enterBackgroundMode}
        onEnterListening={enterListeningRoom}
        onEnterSubject={enterSubjectRoom}
        onOpenChange={setIsMenuOpen}
      />

      <MobileBoxSwitcher
        mode={mobileBoxMode}
        onModeChange={changeMobileBoxMode}
      />

      {isMobileObservationBox ? (
        <ObservationBoxPanel />
      ) : isMobileKnowledgeBox ? (
        <MobileKnowledgeBoxPanel
          allTags={allTags}
          currentTime={currentTime}
          duration={duration}
          episode={selectedEpisode}
          episodes={filteredEpisodes}
          isPlaying={isVoicePlaying}
          onSelectEpisode={playEpisode}
          onTogglePlayback={toggleSelectedEpisodePlayback}
          onToggleTag={toggleTag}
          progress={progress}
          selectedEpisodeNumberLabel={selectedEpisodeNumberLabel}
          selectedTags={selectedTags}
        />
      ) : isBackground ? (
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
          onShowInterface={() => {
            setRoomMode("room");
            setActiveObjectId("window");
            setActivePanel("clock");
            setLastInteractionAt(Date.now());
          }}
          onTogglePlayback={toggleSelectedEpisodePlayback}
        />
      ) : (
        <>
          <SubjectRoomView
            action={currentSubjectAction}
            activeObjectId={activeObjectId}
            broadcastCandidates={broadcastCandidates}
            broadcastLatestEpisode={latestEpisode}
            isPlaying={isVoicePlaying}
            latestEpisode={selectedEpisode}
            logs={logs}
            mode={roomMode === "screensaver" ? "screensaver" : "room"}
            onEnterRoom={() => {
              setRoomMode("room");
              setLastInteractionAt(Date.now());
            }}
            onInspectObject={handleInspectObject}
            onRecordDialogue={handleRecordDialogue}
            relationshipAtmosphere={relationshipAtmosphere}
            sceneQuality={isMobileViewport ? "low" : "high"}
            subject={selectedSubject}
            timeStateLabel={getTimeStateLabel()}
          />

          <section
            className={`room-object-panel ${
              activePanel ? "is-open" : "is-closed"
            } room-object-panel-${activePanel ?? "none"}`}
            aria-live="polite"
          >
            <div className="room-object-panel-header">
              <div>
                <p className="observation-kicker">
                  {selectedObject?.label ?? "部屋"}
                </p>
                <h2>
                  {activePanel === "broadcast"
                    ? "放送室"
                    : activePanel === "terminal"
                      ? "観察端末"
                      : activePanel === "memo"
                        ? "思考の断片"
                        : activePanel === "clock"
                          ? "時計"
                          : "空気"}
                </h2>
              </div>
              <button
                aria-label="パネルを閉じる"
                onClick={() => setActivePanel(null)}
                type="button"
              >
                ×
              </button>
            </div>

            {activePanel === "broadcast" ? (
              <div className="room-panel-scroll">
                <div className="room-broadcast-now">
                  <span className={isVoicePlaying ? "is-live" : ""}>
                    {isVoicePlaying ? "ON AIR" : "STANDBY"}
                  </span>
                  <strong>
                    {selectedEpisodeNumberLabel} {selectedEpisode.title}
                  </strong>
                  <p>{selectedEpisode.description}</p>
                  {selectedEpisodeHasAudio ? (
                    <div className="room-audio-controls">
                      <button
                        className={isVoicePlaying ? "is-playing" : undefined}
                        onClick={toggleSelectedEpisodePlayback}
                        type="button"
                      >
                        {isVoicePlaying ? "一時停止" : "再生"}
                      </button>
                      <span>
                        {isVoicePlaying ? "再生中" : "待機中"} / 音声は常駐再生
                      </span>
                    </div>
                  ) : (
                    <p>この回は準備中です。</p>
                  )}
                  <div className="room-progress">
                    <span>{formatTime(currentTime)}</span>
                    <i>
                      <b style={{ width: `${progress}%` }} />
                    </i>
                    <span>{duration ? formatTime(duration) : selectedEpisode.duration}</span>
                  </div>
                </div>

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

                <div className="room-tag-strip">
                  {allTags.slice(0, 14).map((tag) => (
                    <button
                      className={
                        selectedTags.includes(tag) ? "is-active" : undefined
                      }
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      type="button"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <EpisodeList
                  episodes={filteredEpisodes}
                  onSelectEpisode={playEpisode}
                  selectedEpisodeId={selectedEpisode.id}
                />
              </div>
            ) : null}

            {activePanel === "terminal" ? (
              <div className="room-panel-scroll">
                <div className="terminal-readout">
                  <p>観察ログ</p>
                  {subjectLogs.length > 0 ? (
                    <ol>
                      {subjectLogs.map((log) => (
                        <li key={log.id}>
                          <time>{formatLogTime(log.timestamp)}</time>
                          <span>{log.logText ?? log.thought}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <span>まだ何も残っていない。</span>
                  )}
                </div>

                <div className="terminal-readout">
                  <p>放送テーマ候補履歴</p>
                  {broadcastCandidates.length > 0 ? (
                    <ol>
                      {broadcastCandidates.map((candidate) => (
                        <li key={candidate.id}>
                          <strong>{candidate.theme}</strong>
                          <span>{candidate.hint}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <span>部屋の物を触ると、ここに候補が残る。</span>
                  )}
                </div>
              </div>
            ) : null}

            {activePanel === "memo" ? (
              <div className="room-panel-scroll">
                <div className="memo-paper">
                  <p>{selectedObject?.description ?? currentSubjectAction.thought}</p>
                  <strong>{currentSubjectAction.thought}</strong>
                  <span>broadcastHint: {currentSubjectAction.broadcastHint}</span>
                  <span>themeCandidate: {currentSubjectAction.themeCandidate}</span>
                </div>
                {broadcastCandidates[0] ? (
                  <div className="terminal-readout">
                    <p>最新の候補</p>
                    <strong>{broadcastCandidates[0].theme}</strong>
                    <span>{broadcastCandidates[0].hint}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activePanel === "mood" ? (
              <div className="room-panel-scroll">
                <div className="terminal-readout">
                  <p>光が変わった</p>
                  <strong>{relationshipAtmosphere.headline}</strong>
                  <span>{relationshipAtmosphere.trustLine}</span>
                  <span>{currentSubjectAction.ambientCue}</span>
                </div>
              </div>
            ) : null}

            {activePanel === "clock" ? (
              <div className="room-panel-scroll">
                <div className="terminal-readout">
                  <p>現在時刻</p>
                  <Clock />
                  <strong>{getTimeStateLabel()}</strong>
                  <span>
                    現実の時刻に合わせて、雨、窓の外光、CRTの明るさが少しだけ変わる。
                  </span>
                </div>
              </div>
            ) : null}
          </section>
        </>
      )}

      <div className="room-audio-pocket" aria-hidden="true">
        <audio
          ref={audioRef}
          onEnded={() => {
            setIsVoicePlaying(false);
            handleEpisodeEnded();
          }}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onPause={() => setIsVoicePlaying(false)}
          onPlay={() => setIsVoicePlaying(true)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          preload="metadata"
          src={selectedEpisodeHasAudio ? selectedEpisode.audioUrl : undefined}
        >
          お使いのブラウザは音声再生に対応していません。
        </audio>
      </div>
    </main>
  );
}
