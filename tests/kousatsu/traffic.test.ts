import assert from "node:assert/strict";
import test from "node:test";
import { carPosition, motionDelta, trainPosition } from "../../src/components/observer-room/roomMotion";

const distance = (a: number, b: number, period: number) => ((b - a + period * 1.5) % period) - period / 2;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("traffic covers the same distance at high and low frame rates, including reduced motion", () => {
  for (const reduced of [false, true]) {
    const seconds = 12 * (reduced ? 0.35 : 1);
    for (const fps of [2, 5, 15, 60, 144]) {
      let elapsed = 0;
      for (let frame = 0; frame < 12 * fps; frame++) elapsed += motionDelta(1 / fps, reduced);
      close(elapsed, seconds);
      close(trainPosition(elapsed), trainPosition(seconds));
      for (let car = 0; car < 4; car++) close(carPosition(elapsed, car), carPosition(seconds, car));
    }
    assert.ok(motionDelta(1, reduced) > 0, "reduced motion still allows slow traffic");
  }
  for (const invalid of [NaN, Infinity, -Infinity, -10, 0]) assert.equal(motionDelta(invalid, false), 0);
});

test("cars keep their lane direction and separation through many loops", () => {
  for (let seconds = 0; seconds < 3600; seconds += 0.5) {
    for (let index = 0; index < 4; index++) {
      const a = carPosition(seconds, index), b = carPosition(seconds + 0.5, index);
      assert.ok(a >= -50 && a < 50);
      close(distance(a, b, 100), (index % 2 ? -1.8 : 1.6) * 0.5);
      const sameLane = carPosition(seconds, (index + 2) % 4);
      close(Math.abs(distance(a, sameLane, 100)), 32);
      if (Math.abs(b - a) > 50) assert.ok(Math.abs(a) > 49, "car wraps at the distant route boundary");
    }
  }
});

test("the train travels forward continuously, wraps outside the aperture, and repeats its route", () => {
  let wraps = 0;
  for (let seconds = 0; seconds < 3600; seconds += 0.5) {
    const a = trainPosition(seconds), b = trainPosition(seconds + 0.5);
    assert.ok(a >= -45 && a < 35);
    close(distance(a, b, 80), 1.45 * 0.5);
    if (b < a) { wraps++; assert.ok(a > 34); assert.ok(b < -44); }
    close(trainPosition(seconds + 80 / 1.45), a);
  }
  assert.ok(wraps > 60);
});
