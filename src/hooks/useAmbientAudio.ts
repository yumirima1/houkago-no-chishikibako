"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const COMMON_BGM_SRC = "/bgm/common-night-loop.mp3";

const BGM_ENABLED_STORAGE_KEY = "houkago:bgm-enabled";
const BGM_VOLUME_STORAGE_KEY = "houkago:bgm-volume";
const DEFAULT_BGM_VOLUME = 0.05;
const MAX_BGM_VOLUME = 0.12;
const FADE_IN_MS = 3000;
const FADE_OUT_MS = 1000;

type UseAmbientAudioOptions = {
  isVoicePlaying: boolean;
  src?: string;
};

function clampVolume(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BGM_VOLUME;
  }

  return Math.min(MAX_BGM_VOLUME, Math.max(0, value));
}

export function useAmbientAudio({
  isVoicePlaying,
  src = COMMON_BGM_SRC,
}: UseAmbientAudioOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const fadeLevelRef = useRef(0);
  const volumeRef = useRef(DEFAULT_BGM_VOLUME);
  const [enabled, setEnabledState] = useState(false);
  const [volume, setVolumeState] = useState(DEFAULT_BGM_VOLUME);
  const [isAvailable, setIsAvailable] = useState(false);
  const canSaveSettings = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const stopFade = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const applyVolume = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = clampVolume(volumeRef.current) * fadeLevelRef.current;
  }, []);

  const fadeTo = useCallback(
    (targetLevel: number, durationMs: number, onComplete?: () => void) => {
      const audio = audioRef.current;

      if (!audio) {
        onComplete?.();
        return;
      }

      stopFade();

      const startLevel = fadeLevelRef.current;
      const startedAt = window.performance.now();

      const tick = (now: number) => {
        const elapsed = now - startedAt;
        const progress = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 1;

        fadeLevelRef.current =
          startLevel + (targetLevel - startLevel) * progress;
        applyVolume();

        if (progress < 1) {
          fadeFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }

        fadeFrameRef.current = null;
        onComplete?.();
      };

      fadeFrameRef.current = window.requestAnimationFrame(tick);
    },
    [applyVolume, stopFade],
  );

  const saveSetting = useCallback((key: string, value: string) => {
    if (!canSaveSettings.current) return;
    try {
      window.localStorage.setItem(key, value);
      setStorageError(null);
    } catch {
      setStorageError("BGM設定を保存できません。今回の変更は画面内でのみ有効です。");
    }
  }, []);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    saveSetting(BGM_ENABLED_STORAGE_KEY, String(nextEnabled));
  }, [saveSetting]);

  const setVolume = useCallback((nextVolume: number) => {
    const next = clampVolume(nextVolume);
    setVolumeState(next);
    saveSetting(BGM_VOLUME_STORAGE_KEY, String(next));
  }, [saveSetting]);

  useEffect(() => {
    volumeRef.current = volume;
    applyVolume();
  }, [applyVolume, volume]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedEnabled = window.localStorage.getItem(BGM_ENABLED_STORAGE_KEY);
        const storedVolume = window.localStorage.getItem(BGM_VOLUME_STORAGE_KEY);
        if ((storedEnabled !== null && storedEnabled !== "true" && storedEnabled !== "false") ||
          (storedVolume !== null && (!storedVolume.trim() || !Number.isFinite(Number(storedVolume))))) {
          throw new Error("Invalid BGM settings");
        }

        if (storedEnabled !== null) setEnabledState(storedEnabled === "true");
        if (storedVolume !== null) setVolumeState(clampVolume(Number(storedVolume)));

        canSaveSettings.current = true;
      } catch {
        // Do not save defaults over settings that could not be read.
        setStorageError("BGM設定を読込できないため、設定の保存を停止しています。");
      }
    }, 0);

    return () => {
      canSaveSettings.current = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(src, {
      method: "HEAD",
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setIsAvailable(response.ok);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIsAvailable(false);
        }
      });

    return () => controller.abort();
  }, [src]);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "none";
    audio.volume = 0;
    audioRef.current = audio;

    const handleError = () => {
      setIsAvailable(false);
    };

    audio.addEventListener("error", handleError);

    return () => {
      stopFade();
      audio.removeEventListener("error", handleError);
      audio.pause();
      audioRef.current = null;
    };
  }, [src, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const shouldPlayBgm = enabled && isAvailable && isVoicePlaying;

    if (!shouldPlayBgm) {
      fadeTo(0, FADE_OUT_MS, () => {
        audio.pause();
        audio.currentTime = 0;
      });
      return;
    }

    const startBgm = async () => {
      try {
        if (audio.paused) {
          fadeLevelRef.current = 0;
          audio.volume = 0;
          await audio.play();
        }

        fadeTo(1, FADE_IN_MS);
      } catch {
        fadeTo(0, FADE_OUT_MS, () => {
          audio.pause();
          audio.currentTime = 0;
        });
      }
    };

    void startBgm();
  }, [enabled, fadeTo, isAvailable, isVoicePlaying]);

  return {
    enabled,
    isAvailable,
    setEnabled,
    setVolume,
    storageError,
    volume,
  };
}
