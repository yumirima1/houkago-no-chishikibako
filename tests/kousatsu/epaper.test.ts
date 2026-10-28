import assert from "node:assert/strict";
import test from "node:test";
import { matchesImageSignature, validateImageFile, MAX_IMAGE_BYTES } from "../../src/components/observer-room/epaperStorage";
import { roomCameraPosition, roomCameraTarget } from "../../src/components/observer-room/roomMotion";
import { ROOM_SIZE } from "../../src/components/observer-room/roomLayout";

test("epaper rejects active formats, empty files, oversized files and spoofed signatures", () => {
  for (const type of ["image/svg+xml", "text/html", "image/gif", ""]) assert.throws(() => validateImageFile({ type, size: 100 }));
  for (const size of [0, MAX_IMAGE_BYTES + 1]) assert.throws(() => validateImageFile({ type: "image/png", size }));
  validateImageFile({ type: "image/jpeg", size: MAX_IMAGE_BYTES });
  assert.equal(matchesImageSignature("image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(matchesImageSignature("image/jpeg", new Uint8Array([255, 216, 255])), true);
  assert.equal(matchesImageSignature("image/webp", new TextEncoder().encode("RIFF0000WEBP")), true);
  assert.equal(matchesImageSignature("image/png", new TextEncoder().encode("<script>")), false);
  assert.equal(matchesImageSignature("image/jpeg", new Uint8Array([255])), false);
});

test("the eye remains inside the room on narrow screens and extreme pointer positions", () => {
  for (const aspect of [0.1, 0.4, 1, 1.6, 3]) for (const pointer of [-Infinity, -100, 0, 100, NaN]) {
    const [x, y, z] = roomCameraPosition(pointer, pointer, aspect);
    assert.ok(x > ROOM_SIZE.left && x < ROOM_SIZE.right);
    assert.ok(y > 1.5 && y < 2);
    assert.ok(z > ROOM_SIZE.back && z < ROOM_SIZE.front);
    const target = roomCameraTarget(pointer, pointer);
    assert.ok(target.every(Number.isFinite)); assert.ok(target[0] > -2 && target[0] < 2);
    assert.ok(target[1] > 0.8 && target[1] < 2.5);
  }
});
