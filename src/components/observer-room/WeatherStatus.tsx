import { WEATHER_LOCATION, type RoomWeather } from "@/lib/observer-weather";
import styles from "./observer-room.module.css";

export function WeatherStatus({ weather }: { weather: RoomWeather }) {
  const status = { loading: "取得中 · 既定の夜景を表示", live: "取得済み", cached: "前回の天候を表示", fallback: "取得できません · 既定の晴れを表示" }[weather.status];
  return <section aria-label="窓の外の天候" className={styles.weatherStatus}>
    <h3>窓の外の天候</h3>
    <dl className={styles.systemGrid}>
      <dt>地域 / 夜景</dt><dd>{WEATHER_LOCATION.city} · {weather.mode === "rain" ? "雨の夜" : "晴れの夜"}</dd>
      <dt>取得状態</dt><dd>{status}</dd>
      <dt>最終取得</dt><dd>{weather.reading ? new Date(weather.reading.fetchedAt).toLocaleString("ja-JP") : "まだ取得していません"}</dd>
    </dl>
    <p>天気は15分間隔で更新します。景色は時刻にかかわらず夜です。</p>
    <p>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
  </section>;
}
