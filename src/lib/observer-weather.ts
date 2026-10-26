import configuration from "@/config/observer-room.json";

export type NightWeather = "clear" | "rain";
export type WeatherReading = { mode: NightWeather; code: number; observedAt: number; fetchedAt: number };
export type RoomWeather = { mode: NightWeather; status: "loading" | "live" | "cached" | "fallback"; reading: WeatherReading | null };
export const WEATHER_LOCATION = configuration.weather;
export const WEATHER_REFRESH_MS = WEATHER_LOCATION.refreshMinutes * 60_000;
export const WEATHER_CACHE_KEY = `observer-weather-v1:${WEATHER_LOCATION.latitude},${WEATHER_LOCATION.longitude}`;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const dryCodes = new Set([0, 1, 2, 3, 45, 48]);
const wetCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99]);

export const initialWeather: RoomWeather = { mode: WEATHER_LOCATION.defaultMode === "rain" ? "rain" : "clear", status: "loading", reading: null };

export function weatherUrl() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(WEATHER_LOCATION.latitude), longitude: String(WEATHER_LOCATION.longitude),
    current: "weather_code,precipitation", timeformat: "unixtime", timezone: "GMT", forecast_days: "1" }).toString();
  return url.href;
}

/** All precipitation (including snow/hail) uses the rainy-night visual. No daylight field is used. */
export function parseWeather(data: unknown, now: number): WeatherReading {
  const current = (data as { current?: Record<string, unknown> } | null)?.current;
  const code = current?.weather_code, precipitation = current?.precipitation, time = current?.time;
  if (typeof code !== "number" || (!dryCodes.has(code) && !wetCodes.has(code)) ||
    typeof precipitation !== "number" || !Number.isFinite(precipitation) || precipitation < 0 ||
    typeof time !== "number" || !Number.isFinite(time) || Math.abs(now - time * 1000) > 24 * 60 * 60_000) {
    throw new Error("天候データの形式または時刻を確認できませんでした。");
  }
  return { mode: wetCodes.has(code) || precipitation > 0 ? "rain" : "clear", code, observedAt: time * 1000, fetchedAt: now };
}

export function readWeatherCache(text: string | null, now: number): WeatherReading | null {
  try {
    const data = JSON.parse(text ?? "null");
    if (!data || typeof data.fetchedAt !== "number" || !Number.isFinite(data.fetchedAt) ||
      now < data.fetchedAt || now - data.fetchedAt > CACHE_MAX_AGE_MS) return null;
    const reading = parseWeather({ current: { weather_code: data.code, precipitation: data.mode === "rain" ? 1 : 0, time: data.observedAt / 1000 } }, data.fetchedAt);
    return reading.mode === data.mode ? reading : null;
  } catch { return null; }
}

export function weatherFallback(reading: WeatherReading | null): RoomWeather {
  return reading ? { mode: reading.mode, status: "cached", reading }
    : { ...initialWeather, status: "fallback" };
}
