export const MAX_ROOM_EXPORT_BYTES = 25 * 1024 * 1024;

export function validateGlbPayload(bytes: Uint8Array) {
  if (bytes.byteLength < 12) {
    throw new Error("GLB payload is too short.");
  }
  if (
    bytes[0] !== 0x67 ||
    bytes[1] !== 0x6c ||
    bytes[2] !== 0x54 ||
    bytes[3] !== 0x46
  ) {
    throw new Error("GLB payload has an invalid magic header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}.`);
  if (declaredLength !== bytes.byteLength) {
    throw new Error("GLB declared length does not match the payload length.");
  }
}

export function isAllowedRoomExportRequest(
  request: Request,
  environment: { enabled?: string; nodeEnv?: string },
) {
  if (environment.nodeEnv !== "development" || environment.enabled !== "1") {
    return false;
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
