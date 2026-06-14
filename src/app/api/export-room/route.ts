import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const EXPORT_FILE_NAME = "exported-window-side-room.glb";

export async function POST(request: Request) {
  const arrayBuffer = await request.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty GLB payload" }, { status: 400 });
  }

  const exportsDirectory = path.join(process.cwd(), "public", "exports");
  const outputPath = path.join(exportsDirectory, EXPORT_FILE_NAME);

  await mkdir(exportsDirectory, { recursive: true });
  await writeFile(outputPath, bytes);

  return NextResponse.json({
    path: `/exports/${EXPORT_FILE_NAME}`,
    size: bytes.byteLength,
  });
}
