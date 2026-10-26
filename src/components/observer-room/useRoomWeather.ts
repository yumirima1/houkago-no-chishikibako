"use client";

import { useEffect, useState } from "react";
import { initialWeather, readWeatherCache, parseWeather, weatherFallback, weatherUrl, WEATHER_CACHE_KEY,
  WEATHER_REFRESH_MS, type RoomWeather, type WeatherReading } from "@/lib/observer-weather";

export function useRoomWeather() {
  const [weather, setWeather] = useState<RoomWeather>(initialWeather);
  useEffect(() => {
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null, nextRefresh = 0;
    let reading: WeatherReading | null = null;
    try { reading = readWeatherCache(localStorage.getItem(WEATHER_CACHE_KEY), Date.now()); } catch { /* Storage can be disabled. */ }
    const update = (value: RoomWeather) => { if (!disposed) setWeather(value); };
    const schedule = () => {
      clearTimeout(timer);
      if (!disposed && !document.hidden) timer = setTimeout(() => { void refresh(); }, Math.max(100, nextRefresh - Date.now()));
    };
    const refresh = async () => {
      if (disposed || document.hidden || controller) return;
      if (Date.now() < nextRefresh) { schedule(); return; }
      if (reading && Date.now() - reading.fetchedAt < WEATHER_REFRESH_MS) {
        nextRefresh = reading.fetchedAt + WEATHER_REFRESH_MS;
        update({ mode: reading.mode, status: "cached", reading }); schedule(); return;
      }
      controller = new AbortController();
      const request = controller;
      const timeout = setTimeout(() => request.abort(), 8000);
      try {
        const response = await fetch(weatherUrl(), { signal: request.signal, credentials: "omit", referrerPolicy: "no-referrer" });
        if (!response.ok) throw new Error("Weather unavailable");
        const result = parseWeather(await response.json(), Date.now());
        if (disposed || request.signal.aborted) return;
        reading = result;
        try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(reading)); } catch { /* In-memory fallback remains available. */ }
        update({ mode: reading.mode, status: "live", reading });
      } catch {
        if (!disposed) update(weatherFallback(reading));
      } finally {
        clearTimeout(timeout); controller = null;
        nextRefresh = document.hidden && request.signal.aborted ? 0 : Date.now() + WEATHER_REFRESH_MS;
        schedule();
      }
    };
    const visibility = () => {
      if (document.hidden) { clearTimeout(timer); controller?.abort(); }
      else { void refresh(); }
    };
    const online = () => { if (Date.now() >= nextRefresh) void refresh(); };
    // Keep hydration deterministic; neither the cache nor a request gates the 3D scene.
    Promise.resolve().then(() => { if (!disposed) { if (reading) update(weatherFallback(reading)); void refresh(); } });
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", online);
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); };
  }, []);
  return weather;
}
