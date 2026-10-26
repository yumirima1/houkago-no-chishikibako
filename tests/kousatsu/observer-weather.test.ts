import assert from "node:assert/strict";
import test from "node:test";
import { parseWeather, readWeatherCache, weatherFallback, weatherUrl, WEATHER_LOCATION } from "../../src/lib/observer-weather";

const now = Date.UTC(2026, 9, 26, 12);
const response = (code: number, precipitation = 0) => ({ current: { weather_code: code, precipitation, time: now / 1000 }, is_day: 1 });

test("Configured weather belongs to the user's Fukuoka City and never requests device location or daylight", () => {
  const url = new URL(weatherUrl());
  assert.equal(url.origin, "https://api.open-meteo.com");
  assert.equal(WEATHER_LOCATION.city, "福岡市");
  assert.equal(url.searchParams.get("latitude"), "33.6");
  assert.equal(url.searchParams.get("longitude"), "130.41667");
  assert.equal(url.searchParams.get("current"), "weather_code,precipitation");
  assert.equal(url.searchParams.has("apikey"), false);
});

test("Dry/cloud/fog conditions remain clear night, and all precipitation codes use rainy night", () => {
  for (const code of [0, 1, 2, 3, 45, 48]) assert.equal(parseWeather(response(code), now).mode, "clear");
  for (const code of [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99]) {
    assert.equal(parseWeather(response(code), now).mode, "rain");
  }
  assert.equal(parseWeather(response(3, 0.1), now).mode, "rain");
});

test("Invalid/stale weather is rejected instead of treating an API failure as clear sky", () => {
  for (const data of [null, {}, response(999), response(0, -1), response(0, NaN), { current: { weather_code: 0 } }]) {
    assert.throws(() => parseWeather(data, now));
  }
  assert.throws(() => parseWeather(response(0), now + 25 * 60 * 60_000));
});

test("A failed request retains a valid cached rainy result; absent/damaged/expired cache uses configured default", () => {
  const reading = parseWeather(response(63, 1), now);
  const cached = readWeatherCache(JSON.stringify(reading), now + 16 * 60_000);
  assert.deepEqual(cached, reading);
  assert.deepEqual(weatherFallback(cached), { mode: "rain", status: "cached", reading });
  for (const data of [null, "broken", "{}", JSON.stringify({ ...reading, mode: "clear" }), JSON.stringify({ ...reading, fetchedAt: now + 1 })]) {
    assert.equal(readWeatherCache(data, now), null);
  }
  assert.equal(readWeatherCache(JSON.stringify(reading), now + 8 * 24 * 60 * 60_000), null);
  assert.equal(weatherFallback(null).mode, "clear");
  assert.equal(weatherFallback(null).status, "fallback");
});
