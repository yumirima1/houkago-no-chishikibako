import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedRoomExportRequest,
  validateGlbPayload,
} from "../../src/lib/room-export-security";

function glb(length = 12) {
  const bytes = new Uint8Array(length);
  bytes.set([0x67, 0x6c, 0x54, 0x46]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, length, true);
  return bytes;
}

test("room export requires an explicit development flag and same origin", () => {
  const request = new Request("http://localhost:3000/api/export-room", {
    headers: { host: "localhost:3000", origin: "http://localhost:3000" },
    method: "POST",
  });
  assert.equal(
    isAllowedRoomExportRequest(request, { enabled: "1", nodeEnv: "development" }),
    true,
  );
  assert.equal(
    isAllowedRoomExportRequest(request, { enabled: "1", nodeEnv: "production" }),
    false,
  );
  const crossOrigin = new Request("http://localhost:3000/api/export-room", {
    headers: { host: "localhost:3000", origin: "https://attacker.invalid" },
    method: "POST",
  });
  assert.equal(
    isAllowedRoomExportRequest(crossOrigin, {
      enabled: "1",
      nodeEnv: "development",
    }),
    false,
  );
});

test("room export accepts only structurally valid GLB headers", () => {
  assert.doesNotThrow(() => validateGlbPayload(glb()));
  assert.throws(() => validateGlbPayload(new Uint8Array(12)), /magic header/);
  const wrongLength = glb(16);
  new DataView(wrongLength.buffer).setUint32(8, 12, true);
  assert.throws(() => validateGlbPayload(wrongLength), /declared length/);
});
