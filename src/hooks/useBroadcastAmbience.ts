"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AmbienceLayerKey = "rain" | "wind" | "room" | "thunder";

export type AmbienceVolumes = Record<AmbienceLayerKey, number>;

const AMBIENCE_ENABLED_STORAGE_KEY = "houkago:ambience-enabled";
const AMBIENCE_VOLUME_STORAGE_PREFIX = "houkago:ambience-volume:";
const MAX_AMBIENCE_VOLUME = 0.28;
const DEFAULT_VOLUMES: AmbienceVolumes = {
  rain: 0.12,
  room: 0.05,
  thunder: 0.04,
  wind: 0.04,
};

type AmbienceGraph = {
  context: AudioContext;
  masterGain: GainNode;
  rainGain: GainNode;
  rainSource: AudioBufferSourceNode;
  roomGain: GainNode;
  roomOscillator: OscillatorNode;
  thunderGain: GainNode;
  thunderTimer: number | null;
  windGain: GainNode;
  windSource: AudioBufferSourceNode;
};

type UseBroadcastAmbienceOptions = {
  isActive: boolean;
};

function clampVolume(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(MAX_AMBIENCE_VOLUME, Math.max(0, value));
}

function createNoiseBuffer(context: AudioContext, seconds: number) {
  const buffer = context.createBuffer(
    1,
    Math.floor(context.sampleRate * seconds),
    context.sampleRate,
  );
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function getAudioContext() {
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  return AudioContextClass ? new AudioContextClass() : null;
}

function createAmbienceGraph(): AmbienceGraph | null {
  const context = getAudioContext();

  if (!context) {
    return null;
  }

  const masterGain = context.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(context.destination);

  const rainGain = context.createGain();
  rainGain.gain.value = 0;
  const rainFilter = context.createBiquadFilter();
  rainFilter.type = "highpass";
  rainFilter.frequency.value = 900;
  const rainSoften = context.createBiquadFilter();
  rainSoften.type = "lowpass";
  rainSoften.frequency.value = 5400;
  const rainSource = context.createBufferSource();
  rainSource.buffer = createNoiseBuffer(context, 2.4);
  rainSource.loop = true;
  rainSource.connect(rainFilter);
  rainFilter.connect(rainSoften);
  rainSoften.connect(rainGain);
  rainGain.connect(masterGain);
  rainSource.start();

  const windGain = context.createGain();
  windGain.gain.value = 0;
  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 520;
  const windSource = context.createBufferSource();
  windSource.buffer = createNoiseBuffer(context, 3.2);
  windSource.loop = true;
  windSource.playbackRate.value = 0.48;
  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  windSource.start();

  const roomGain = context.createGain();
  roomGain.gain.value = 0;
  const roomFilter = context.createBiquadFilter();
  roomFilter.type = "lowpass";
  roomFilter.frequency.value = 160;
  const roomOscillator = context.createOscillator();
  roomOscillator.type = "sine";
  roomOscillator.frequency.value = 58;
  roomOscillator.connect(roomFilter);
  roomFilter.connect(roomGain);
  roomGain.connect(masterGain);
  roomOscillator.start();

  const thunderGain = context.createGain();
  thunderGain.gain.value = 0;
  thunderGain.connect(masterGain);

  return {
    context,
    masterGain,
    rainGain,
    rainSource,
    roomGain,
    roomOscillator,
    thunderGain,
    thunderTimer: null,
    windGain,
    windSource,
  };
}

function setGain(gain: GainNode, value: number) {
  const now = gain.context.currentTime;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setTargetAtTime(value, now, 0.08);
}

function triggerThunder(graph: AmbienceGraph) {
  if (graph.thunderGain.gain.value <= 0.001) {
    return;
  }

  const { context, thunderGain } = graph;
  const oscillator = context.createOscillator();
  const lowPass = context.createBiquadFilter();
  const hitGain = context.createGain();
  const noise = context.createBufferSource();
  const noiseGain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(42, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(22, context.currentTime + 1.8);
  lowPass.type = "lowpass";
  lowPass.frequency.value = 180;
  hitGain.gain.setValueAtTime(0.5, context.currentTime);
  hitGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 2.6);
  oscillator.connect(lowPass);
  lowPass.connect(hitGain);
  hitGain.connect(thunderGain);

  noise.buffer = createNoiseBuffer(context, 1.4);
  noiseGain.gain.setValueAtTime(0.18, context.currentTime + 0.06);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.4);
  noise.connect(noiseGain);
  noiseGain.connect(thunderGain);

  oscillator.start();
  oscillator.stop(context.currentTime + 2.7);
  noise.start(context.currentTime + 0.05);
  noise.stop(context.currentTime + 1.5);
}

function scheduleThunder(graph: AmbienceGraph, volumes: AmbienceVolumes) {
  if (graph.thunderTimer !== null) {
    window.clearTimeout(graph.thunderTimer);
    graph.thunderTimer = null;
  }

  if (volumes.thunder <= 0) {
    return;
  }

  const delay = 9500 + Math.random() * 10500;
  graph.thunderTimer = window.setTimeout(() => {
    triggerThunder(graph);
    scheduleThunder(graph, volumes);
  }, delay);
}

export function useBroadcastAmbience({ isActive }: UseBroadcastAmbienceOptions) {
  const graphRef = useRef<AmbienceGraph | null>(null);
  const volumesRef = useRef<AmbienceVolumes>(DEFAULT_VOLUMES);
  const [enabled, setEnabledState] = useState(false);
  const [volumes, setVolumesState] = useState<AmbienceVolumes>(DEFAULT_VOLUMES);
  const [isAvailable, setIsAvailable] = useState(true);
  const canSaveSettings = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const ensureGraph = useCallback(() => {
    if (graphRef.current) {
      return graphRef.current;
    }

    const graph = createAmbienceGraph();
    graphRef.current = graph;
    setIsAvailable(Boolean(graph));

    return graph;
  }, []);

  const applyVolumes = useCallback((nextVolumes: AmbienceVolumes) => {
    const graph = graphRef.current;

    if (!graph) {
      return;
    }

    setGain(graph.rainGain, nextVolumes.rain);
    setGain(graph.windGain, nextVolumes.wind);
    setGain(graph.roomGain, nextVolumes.room);
    setGain(graph.thunderGain, nextVolumes.thunder);
    scheduleThunder(graph, nextVolumes);
  }, []);

  const saveSetting = useCallback((key: string, value: string) => {
    if (!canSaveSettings.current) return;
    try {
      window.localStorage.setItem(key, value);
      setStorageError(null);
    } catch {
      setStorageError("環境音設定を保存できません。今回の変更は画面内でのみ有効です。");
    }
  }, []);

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      setEnabledState(nextEnabled);
      saveSetting(AMBIENCE_ENABLED_STORAGE_KEY, String(nextEnabled));

      if (!nextEnabled) {
        return;
      }

      const graph = ensureGraph();
      void graph?.context.resume();
    },
    [ensureGraph, saveSetting],
  );

  const setVolume = useCallback(
    (layer: AmbienceLayerKey, nextVolume: number) => {
      const nextVolumes = { ...volumesRef.current, [layer]: clampVolume(nextVolume) };
      volumesRef.current = nextVolumes;
      setVolumesState(nextVolumes);
      applyVolumes(nextVolumes);
      saveSetting(`${AMBIENCE_VOLUME_STORAGE_PREFIX}${layer}`, String(nextVolumes[layer]));

      if (enabled) {
        const graph = ensureGraph();
        void graph?.context.resume();
      }
    },
    [applyVolumes, enabled, ensureGraph, saveSetting],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedEnabled = window.localStorage.getItem(AMBIENCE_ENABLED_STORAGE_KEY);
        if (storedEnabled !== null && storedEnabled !== "true" && storedEnabled !== "false") {
          throw new Error("Invalid ambience setting");
        }
        const nextVolumes = { ...DEFAULT_VOLUMES };

        (Object.keys(DEFAULT_VOLUMES) as AmbienceLayerKey[]).forEach((layer) => {
          const storedVolume = window.localStorage.getItem(`${AMBIENCE_VOLUME_STORAGE_PREFIX}${layer}`);
          if (storedVolume !== null && (!storedVolume.trim() || !Number.isFinite(Number(storedVolume)))) {
            throw new Error("Invalid ambience volume");
          }

          if (storedVolume !== null) nextVolumes[layer] = clampVolume(Number(storedVolume));
        });

        volumesRef.current = nextVolumes;
        setVolumesState(nextVolumes);

        if (storedEnabled !== null) setEnabledState(storedEnabled === "true");
        canSaveSettings.current = true;
      } catch {
        setStorageError("環境音設定を読込できないため、設定の保存を停止しています。");
      }
    }, 0);

    return () => {
      canSaveSettings.current = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    volumesRef.current = volumes;
    applyVolumes(volumes);
  }, [applyVolumes, volumes]);

  useEffect(() => {
    const graph = graphRef.current;

    if (!enabled || !isActive) {
      if (graph) {
        setGain(graph.masterGain, 0);
        if (graph.thunderTimer !== null) {
          window.clearTimeout(graph.thunderTimer);
          graph.thunderTimer = null;
        }
      }
      return;
    }

    const activeGraph = ensureGraph();

    if (!activeGraph) {
      return;
    }

    void activeGraph.context.resume();
    setGain(activeGraph.masterGain, 1);
    applyVolumes(volumesRef.current);
  }, [applyVolumes, enabled, ensureGraph, isActive]);

  useEffect(() => {
    return () => {
      const graph = graphRef.current;

      if (!graph) {
        return;
      }

      if (graph.thunderTimer !== null) {
        window.clearTimeout(graph.thunderTimer);
      }

      graph.rainSource.stop();
      graph.windSource.stop();
      graph.roomOscillator.stop();
      void graph.context.close();
      graphRef.current = null;
    };
  }, []);

  return {
    enabled,
    isAvailable,
    setEnabled,
    setVolume,
    storageError,
    volumes,
  };
}
