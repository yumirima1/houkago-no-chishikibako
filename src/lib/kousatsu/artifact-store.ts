import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

export function contentDigest(contents: string) {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

function hasCode(error: unknown, code: string) {
  return error instanceof Error && "code" in error && error.code === code;
}

async function matchesExisting(filePath: string, contents: string) {
  try {
    const info = await lstat(/* turbopackIgnore: true */ filePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`ARTIFACT_CONFLICT: output is not a regular file: ${filePath}`);
    }
    if (!(await readFile(/* turbopackIgnore: true */ filePath)).equals(Buffer.from(contents, "utf8"))) {
      throw new Error(`ARTIFACT_CONFLICT: preserving different existing content: ${filePath}`);
    }
    return true;
  } catch (error) {
    if (hasCode(error, "ENOENT")) return false;
    throw error;
  }
}

/** Publish a complete file without ever replacing an existing directory entry.
 * The DB export manifest is the recovery source; an identical existing file is
 * an idempotent success, while a hand edit or name collision stops the export.
 */
export async function publishArtifact(
  filePath: string,
  contents: string,
  assertOwnership: () => void,
) {
  assertOwnership();
  await mkdir(path.dirname(filePath), { recursive: true });
  if (await matchesExisting(filePath, contents)) return;

  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  const file = await open(temporaryPath, "wx", 0o600);
  try {
    try {
      await file.writeFile(contents, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    assertOwnership();
    try {
      // Same-directory hard link publishes fully written bytes atomically and
      // fails on EEXIST. rename() would overwrite user edits on retry.
      await link(temporaryPath, filePath);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      if (!(await matchesExisting(filePath, contents))) {
        throw new Error(`ARTIFACT_CONFLICT: destination changed during publication: ${filePath}`);
      }
    }
    assertOwnership();
  } finally {
    await unlink(temporaryPath);
  }
}
