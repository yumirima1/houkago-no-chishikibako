"use client";

import { useEffect, useRef, useState } from "react";
import { initialRoomSound, RoomAudio } from "./roomAudio";
import type { RoomSession } from "./roomSession";
import type { NightWeather } from "@/lib/observer-weather";

export function useRoomSound(session: RoomSession | null, windowOpen: boolean, weather: NightWeather) {
  const engine = useRef<RoomAudio | null>(null);
  const desired = useRef({ music: false, ambient: true, weather });
  const [state, setState] = useState(initialRoomSound);
  const [musicWanted, setMusicWanted] = useState(false);
  const [ambientWanted, setAmbientWanted] = useState(true);
  useEffect(() => {
    if (!session) return;
    const audio = new RoomAudio(setState); engine.current = audio;
    audio.window(session.windowOpen); desired.current.music = session.musicWanted;
    const timer = setTimeout(() => {
      setMusicWanted(session.musicWanted);
      void audio.play("music", session.musicWanted);
      void audio.play("city", true);
      void audio.play("rain", desired.current.weather === "rain");
    }, 0);
    return () => { clearTimeout(timer); audio.dispose(); if (engine.current === audio) engine.current = null; };
  }, [session]);
  useEffect(() => { engine.current?.window(windowOpen); }, [windowOpen]);
  useEffect(() => {
    desired.current.weather = weather;
    if (engine.current && desired.current.ambient) void engine.current.play("rain", weather === "rain");
  }, [weather]);
  function activate() {
    const audio = engine.current;
    if (!audio) return;
    void audio.play("music", desired.current.music);
    void audio.play("city", desired.current.ambient);
    void audio.play("rain", desired.current.ambient && desired.current.weather === "rain");
  }
  function toggleMusic() {
    const playing = state.music.status === "playing" || state.music.status === "starting";
    desired.current.music = !playing; setMusicWanted(!playing);
    void engine.current?.play("music", !playing);
  }
  function toggleAmbient() {
    const next = state.city.status !== "playing" && state.city.status !== "starting";
    desired.current.ambient = next; setAmbientWanted(next);
    void engine.current?.play("city", next);
    void engine.current?.play("rain", next && desired.current.weather === "rain");
  }
  const needsGesture = state.music.status === "blocked" || state.city.status === "blocked" || state.rain.status === "blocked";
  return { state, musicWanted, ambientWanted, needsGesture, activate, toggleMusic, toggleAmbient,
    setMusicVolume: (volume: number) => engine.current?.volume("music", volume) };
}
export type RoomSoundController = ReturnType<typeof useRoomSound>;
