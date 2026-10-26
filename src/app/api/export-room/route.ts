import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  isAllowedRoomExportRequest,
  MAX_ROOM_EXPORT_BYTES,
  validateGlbPayload,
} from "@/lib/room-export-security";

export const runtime = "nodejs";

const EXPORT_FILE_NAME = "exported-window-side-room.glb";

async function readLimitedBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_ROOM_EXPORT_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ROOM_EXPORT_BYTES) {
      await reader.cancel("Room export size limit exceeded");
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function POST(request: Request) {
  if (
    !isAllowedRoomExportRequest(request, {
      enabled: process.env.ROOM_EXPORT_ENABLED,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return NextResponse.json({ error: "Room export is disabled." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "model/gltf-binary" && contentType !== "application/octet-stream") {
    return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBody(request);
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return NextResponse.json({ error: "GLB payload is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Could not read GLB payload." }, { status: 400 });
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty GLB payload" }, { status: 400 });
  }

  try {
    validateGlbPayload(bytes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid GLB payload." },
      { status: 400 },
    );
  }

  const exportsDirectory = path.join(process.cwd(), "public", "exports");
  const outputPath = path.join(exportsDirectory, EXPORT_FILE_NAME);
  const temporaryPath = path.join(
    exportsDirectory,
    `.${EXPORT_FILE_NAME}.${randomUUID()}.tmp`,
  );

  try {
    await mkdir(exportsDirectory, { recursive: true });
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, outputPath);
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
    return NextResponse.json({ error: "Room export could not be saved." }, { status: 500 });
  }

  return NextResponse.json({
    path: `/exports/${EXPORT_FILE_NAME}`,
    size: bytes.byteLength,
  });
}
