import { ResearchRuntime, researchNote, researchSnapshot } from "./runtime-service";
import type { ResearchNote, ResearchSnapshot } from "./runtime-types";

const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, private",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

type RuntimeSession = Pick<ResearchRuntime, "snapshot" | "enqueue" | "tick" | "close"> & {
  store: Pick<ResearchRuntime["store"], "retry" | "cancel">;
};

type HttpDependencies = {
  environment?: () => { nodeEnv?: string; enabled?: string };
  open?: () => Promise<RuntimeSession>;
  snapshot?: () => Promise<ResearchSnapshot>;
  note?: (id: string) => Promise<ResearchNote | null>;
};

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: RESPONSE_HEADERS });
}

/** Local-only access also rejects proxy and DNS-rebinding shaped requests. */
export function assertResearchRequest(
  request: Request,
  environment: { nodeEnv?: string; enabled?: string },
  method: "GET" | "POST",
) {
  if (request.method !== method) throw new HttpError(405, "METHOD_NOT_ALLOWED");
  if (environment.nodeEnv !== "development" && environment.enabled !== "1") {
    throw new HttpError(403, "LOCAL_RESEARCH_DISABLED");
  }
  const url = new URL(request.url);
  const host = request.headers.get("host");
  // NextRequest normalizes a direct 127.0.0.1 / ::1 URL to localhost.
  // Recognize only that specific transformation with Next's complete, matching
  // loopback headers. Origin must still match the browser's actual Host.
  const normalizedLoopback = url.hostname === "localhost" && host !== null &&
    /^(127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host) &&
    new URL(`${url.protocol}//${host}`).port === url.port &&
    request.headers.get("x-forwarded-host") === host &&
    request.headers.get("x-forwarded-proto") === url.protocol.slice(0, -1) &&
    request.headers.get("x-forwarded-port") === (url.port || (url.protocol === "https:" ? "443" : "80")) &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.headers.get("x-forwarded-for") ?? "");
  if (!["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) ||
      !host || (host.toLowerCase() !== url.host.toLowerCase() && !normalizedLoopback)) {
    throw new HttpError(403, "LOOPBACK_REQUIRED");
  }
  // Next itself supplies these four headers for direct local requests. Accept
  // only that consistent loopback shape; never trust a proxy chain or overrides.
  const forwarded: Record<string, string[]> = {
    "x-forwarded-host": [host], "x-forwarded-proto": [url.protocol.slice(0, -1)],
    "x-forwarded-port": [url.port || (url.protocol === "https:" ? "443" : "80")],
    "x-forwarded-for": ["127.0.0.1", "::1", "::ffff:127.0.0.1"],
  };
  for (const [name, value] of request.headers) {
    if (name === "forwarded" || (name.startsWith("x-forwarded-") && !forwarded[name]?.includes(value))) {
      throw new HttpError(403, "PROXY_REQUEST_REJECTED");
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "CROSS_SITE_REQUEST_REJECTED");
  }
  const origin = request.headers.get("origin");
  if (method === "POST" && !origin) throw new HttpError(403, "SAME_ORIGIN_REQUIRED");
  const browserOrigin = new URL(`${url.protocol}//${host}`).origin;
  if (origin && origin !== browserOrigin) throw new HttpError(403, "SAME_ORIGIN_REQUIRED");
  if (method === "POST") {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
        ![null, "identity"].includes(request.headers.get("content-encoding"))) {
      throw new HttpError(415, "JSON_REQUIRED");
    }
  }
}

async function boundedBody(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    throw new HttpError(/^\d+$/.test(declaredLength) ? 413 : 400, "INVALID_BODY_SIZE");
  }
  if (!request.body) throw new HttpError(400, "INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new HttpError(413, "INVALID_BODY_SIZE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch { throw new HttpError(400, "INVALID_JSON"); }
}

function action(value: Record<string, unknown>) {
  const fields: Record<string, string[]> = {
    initialize: ["action"], enqueue: ["action", "sourceId", "topic"],
    tick: ["action"], retry: ["action", "jobId"], cancel: ["action", "jobId"],
  };
  const name = typeof value.action === "string" ? value.action : "";
  if (!Object.hasOwn(fields, name) || Object.keys(value).some((key) => !fields[name].includes(key))) {
    throw new HttpError(400, "INVALID_ACTION");
  }
  if (name === "enqueue" && (typeof value.sourceId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.sourceId) ||
      (value.topic !== undefined && (typeof value.topic !== "string" || !value.topic.trim() || value.topic.length > 200)))) {
    throw new HttpError(400, "INVALID_ENQUEUE_INPUT");
  }
  if ((name === "retry" || name === "cancel") && (typeof value.jobId !== "string" || !UUID.test(value.jobId))) {
    throw new HttpError(400, "INVALID_JOB_ID");
  }
  return name;
}

function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.code }, error.status);
  // API responses do not disclose local paths, credentials, or provider payloads.
  const code = error instanceof Error ? error.message.match(/^[A-Z][A-Z0-9_]+(?=:|$)/)?.[0] : undefined;
  const inputErrors = ["SOURCE_NOT_ENABLED", "TOPIC_INVALID", "SOURCE_CONFIG_INVALID"];
  const conflicts = ["JOB_NOT_RETRYABLE", "JOB_NOT_CANCELLABLE", "QUEUE_JOB_NOT_FOUND"];
  return json({ error: code ?? "RESEARCH_RUNTIME_FAILED" },
    code && inputErrors.includes(code) ? 400 : code && conflicts.includes(code) ? 409 : 500);
}

/** Dependency injection keeps every HTTP regression test on an isolated database. */
export function createResearchHttp(dependencies: HttpDependencies = {}) {
  const environment = dependencies.environment ?? (() => ({ nodeEnv: process.env.NODE_ENV, enabled: process.env.KOUSATSU_LOCAL_ENABLED }));
  const open = dependencies.open ?? (() => ResearchRuntime.open());
  const snapshot = dependencies.snapshot ?? researchSnapshot;
  const note = dependencies.note ?? researchNote;
  return {
    async GET(request: Request) {
      try {
        assertResearchRequest(request, environment(), "GET");
        const params = new URL(request.url).searchParams;
        if ([...params.keys()].some((key) => !["note", "download"].includes(key) || params.getAll(key).length !== 1)) {
          throw new HttpError(400, "INVALID_QUERY");
        }
        const id = params.get("note");
        if (!id) {
          if (params.has("download") || params.has("note")) throw new HttpError(400, "INVALID_NOTE_ID");
          return json(await snapshot());
        }
        if (!UUID.test(id)) throw new HttpError(400, "INVALID_NOTE_ID");
        if (params.has("download") && params.get("download") !== "1") throw new HttpError(400, "INVALID_QUERY");
        const result = await note(id);
        if (!result) return json({ error: "NOTE_NOT_FOUND" }, 404);
        if (!params.has("download")) return json(result);
        // Download the canonical DB Markdown. A conflict on disk is never read
        // as the canonical note or repaired by a GET request.
        return new Response(result.markdown, { headers: {
          ...RESPONSE_HEADERS, "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="kousatsu-${id}.md"`,
          "X-Kousatsu-Artifact": result.artifact,
        } });
      } catch (error) { return failure(error); }
    },
    async POST(request: Request) {
      let runtime: RuntimeSession | undefined;
      try {
        assertResearchRequest(request, environment(), "POST");
        if (new URL(request.url).search) throw new HttpError(400, "INVALID_QUERY");
        const input = await boundedBody(request);
        const name = action(input);
        runtime = await open();
        if (name === "initialize") return json({ status: "initialized" });
        if (name === "enqueue") return json({ jobId: runtime.enqueue(input.sourceId as string, input.topic as string | undefined) }, 202);
        if (name === "retry") {
          runtime.store.retry(input.jobId as string);
          return json({ jobId: input.jobId, status: "ready" });
        }
        if (name === "cancel") {
          runtime.store.cancel(input.jobId as string);
          return json({jobId:input.jobId,status:'cancelled'});
        }
        return json(await runtime.tick());
      } catch (error) { return failure(error); }
      finally { runtime?.close(); }
    },
  };
}
