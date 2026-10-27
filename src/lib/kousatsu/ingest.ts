import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { XMLParser } from "fast-xml-parser";

import { KousatsuDatabase } from "./database";
import type { FeedEntry, SourceInput, StoredItem } from "./types";

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_TEXT_LENGTH = 20_000;
const MAX_REDIRECTS = 3;
const MIN_HOST_INTERVAL_MS = 1_000;
const lastRequestAtByHost = new Map<string, number>();

type FetchLike = typeof fetch;
type ResolveHostname = (hostname: string) => Promise<LookupAddress[]>;
type FeedRequest = (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

export type FeedFetchOptions = {
  accept?: string;
  includeMetadata?: boolean;
  /** Trusted test adapters only; the application never accepts these from HTTP. */
  fetchImpl?: FetchLike;
  resolveHostname?: ResolveHostname;
  requestImpl?: FeedRequest;
  retries?: number;
  /** One attempt's complete deadline, including DNS, rate waiting and all redirects/body. */
  timeoutMs?: number;
  allowedHosts?: string[];
};

export type CollectResult = {
  fetchRunId: string;
  itemIds: string[];
  newItemCount: number;
  responseHash: string;
  totalItemCount: number;
};

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function valueText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return valueText(record["#text"] ?? record["#cdata"] ?? record._ ?? "");
}

function decodeBasicEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

export function normalizeFeedText(value: unknown, maxLength = MAX_ENTRY_TEXT_LENGTH) {
  return decodeBasicEntities(valueText(value).replace(/<[^>]*>/g, " "))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeDate(value: unknown) {
  const text = normalizeFeedText(value, 200);
  if (!text) return undefined;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function atomLink(value: unknown) {
  for (const link of toArray(value)) {
    if (typeof link === "string") return link;
    if (!link || typeof link !== "object") continue;
    const record = link as Record<string, unknown>;
    const relation = normalizeFeedText(record["@_rel"], 40);
    const href = normalizeFeedText(record["@_href"], 2_048);
    if (href && (!relation || relation === "alternate")) return href;
  }
  return "";
}

function entryFromRecord(
  record: Record<string, unknown>,
  format: "rss" | "atom",
): FeedEntry | null {
  const title = normalizeFeedText(record.title, 500);
  const url =
    format === "atom"
      ? atomLink(record.link)
      : normalizeFeedText(record.link ?? record.guid, 2_048);
  if (!title || !url) return null;

  const authorValue =
    record.author && typeof record.author === "object"
      ? (record.author as Record<string, unknown>).name
      : record.author ?? record["dc:creator"];
  const summarySource = record.summary ?? record.description;
  const contentSource = record.content ?? record["content:encoded"] ?? summarySource;

  return {
    author: normalizeFeedText(authorValue, 300) || undefined,
    content: normalizeFeedText(contentSource) || undefined,
    externalId: normalizeFeedText(record.id ?? record.guid, 2_048) || undefined,
    publishedAt: normalizeDate(
      record.published ?? record.updated ?? record.pubDate ?? record.date,
    ),
    summary: normalizeFeedText(summarySource) || undefined,
    title,
    url,
  } satisfies FeedEntry;
}

export function parseFeed(xml: string): { entries: FeedEntry[]; title?: string } {
  const parser = new XMLParser({
    attributeNamePrefix: "@_",
    cdataPropName: "#cdata",
    ignoreAttributes: false,
    parseTagValue: false,
    processEntities: false,
    textNodeName: "#text",
    trimValues: true,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const atom = parsed.feed as Record<string, unknown> | undefined;

  if (channel) {
    return {
      entries: toArray(channel.item)
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object"),
        )
        .map((entry) => entryFromRecord(entry, "rss"))
        .filter((entry): entry is FeedEntry => Boolean(entry)),
      title: normalizeFeedText(channel.title, 500) || undefined,
    };
  }

  if (atom) {
    return {
      entries: toArray(atom.entry)
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object"),
        )
        .map((entry) => entryFromRecord(entry, "atom"))
        .filter((entry): entry is FeedEntry => Boolean(entry)),
      title: normalizeFeedText(atom.title, 500) || undefined,
    };
  }

  throw new Error("The document is neither a supported RSS feed nor an Atom feed.");
}

export function canonicalizeUrl(value: string) {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`Unsupported item URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("Credentials in item URLs are not allowed.");
  }
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|ref$)/i.test(name)) {
      url.searchParams.delete(name);
    }
  }
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  return url.toString();
}

function itemHash(entry: FeedEntry) {
  return createHash("sha256")
    .update([entry.title, entry.summary ?? "", entry.content ?? ""].join("\n"))
    .digest("hex");
}

function responseHash(xml: string) {
  return createHash("sha256").update(xml).digest("hex");
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 192 && parts[1] === 0 && parts[2] <= 2) ||
    (parts[0] === 192 && parts[1] === 88 && parts[2] === 99) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) ||
    (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224
  );
}

function isPrivateAddress(address: string) {
  const kind = isIP(address);
  if (kind === 4) return isPrivateIpv4(address);
  if (kind === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return true;
}

function policyError(message: string) {
  return Object.assign(new Error(message), { retryable: false });
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

async function assertSafeRemoteUrl(value: string, resolveHostname: ResolveHostname, signal: AbortSignal) {
  const url = new URL(value);
  const allowHttp = process.env.KOUSATSU_ALLOW_HTTP === "1";
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw policyError(
      "Feed URLs must use HTTPS (or explicitly enable HTTP for local development).",
    );
  }
  if (url.username || url.password) {
    throw policyError("Credentials in feed URLs are not allowed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname, family: literalFamily }] :
    await abortable(resolveHostname(hostname), signal);
  signal.throwIfAborted();
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw policyError(`Feed host resolves to a private or unsupported address: ${url.hostname}`);
  }
  return { url, addresses };
}

async function enforceHostRateLimit(hostname: string, signal: AbortSignal) {
  const previous = lastRequestAtByHost.get(hostname) ?? 0;
  const waitMs = Math.max(0, MIN_HOST_INTERVAL_MS - (Date.now() - previous));
  if (waitMs > 0) {
    await delay(waitMs, undefined, { signal });
  }
  signal.throwIfAborted();
  lastRequestAtByHost.set(hostname, Date.now());
}

async function readBoundedText(response: Response, signal: AbortSignal) {
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    void response.body?.cancel().catch(() => {});
    throw policyError("Compressed feed responses are not accepted; the reader requests identity encoding.");
  }
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_FEED_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw policyError(`Feed exceeds the ${MAX_FEED_BYTES}-byte limit.`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEED_BYTES) {
        throw policyError(`Feed exceeds the ${MAX_FEED_BYTES}-byte limit.`);
      }
      chunks.push(value);
    }
  } catch (error) {
    // A misbehaving test stream must not extend the deadline through cancel().
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

/** Connect using the already validated answers while preserving Host and TLS identity. */
function pinnedRequest(
  url: URL, addresses: LookupAddress[], signal: AbortSignal,
  requestImpl: FeedRequest = url.protocol === "https:" ? httpsRequest : httpRequest,
  accept = "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
) {
  return new Promise<Response>((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const request = requestImpl(url, {
      agent: false,
      headers: {
        Host: url.host,
        Accept: accept,
        "Accept-Encoding": "identity",
        "User-Agent": "Kousatsu-bako/0.1 (personal research feed reader)",
      },
      maxHeaderSize: 16 * 1024,
      // Keep the original DNS name for SNI/certificate checking. Never disable
      // rejectUnauthorized or let an Agent/proxy reuse an unvalidated socket.
      ...(isIP(hostname) ? {} : { servername: hostname }),
      lookup: (requested, options, callback) => {
        if (requested !== hostname) return callback(new Error("Pinned lookup hostname mismatch."), []);
        const candidates = options.family === 4 || options.family === 6
          ? addresses.filter((address) => address.family === options.family) : addresses;
        if (!candidates.length) return callback(new Error("No validated address matches the requested IP family."), []);
        if (options.all) callback(null, candidates.map((address) => ({ ...address })));
        else callback(null, candidates[0].address, candidates[0].family);
      },
      signal,
    }, (incoming) => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        }
        const status = incoming.statusCode ?? 500;
        // Redirect/error bodies have no use to this reader. Close immediately so
        // their streams cannot consume unbounded memory or outlive this attempt.
        if (status < 200 || status >= 300 || status === 204 || status === 205) {
          incoming.destroy();
          resolve(new Response(null, { status, headers }));
        } else {
          resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status, headers }));
        }
      } catch (error) {
        incoming.destroy();
        reject(error);
      }
    });
    request.once("error", reject);
    request.end();
  });
}

async function fetchOnce(
  initialUrl: string,
  options: FeedFetchOptions,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Feed retrieval timed out.", "TimeoutError")), timeoutMs);
  const signal = controller.signal;
  const resolveHostname = options.resolveHostname ?? ((hostname: string) => lookup(hostname, { all: true, verbatim: true }));
  let currentUrl = initialUrl;

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const allowedHosts = options.allowedHosts ?? process.env.KOUSATSU_FEED_HOSTS?.split(',').filter(Boolean);
      if (allowedHosts && !allowedHosts.includes(new URL(currentUrl).hostname)) {
        throw Object.assign(new Error('FEED_HOST_NOT_ALLOWED'), {retryable:false});
      }
      const { url, addresses } = await assertSafeRemoteUrl(currentUrl, resolveHostname, signal);
      await enforceHostRateLimit(url.hostname, signal);
      // Only an explicitly injected test fetch bypasses our pinned transport.
      const response = await abortable(options.fetchImpl ? options.fetchImpl(url, {
        headers: {
          Accept: options.accept ?? "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9",
          "Accept-Encoding": "identity",
          "User-Agent": "Kousatsu-bako/0.1 (personal research feed reader)",
        },
        redirect: "manual",
        signal,
      }) : pinnedRequest(url, addresses, signal, options.requestImpl, options.accept), signal);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        void response.body?.cancel().catch(() => {});
        if (!location) throw new Error(`Feed redirect ${response.status} has no Location header.`);
        currentUrl = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        const error = new Error(`Feed request failed with HTTP ${response.status}.`);
        Object.assign(error, { httpStatus: response.status });
        throw error;
      }

      return { httpStatus: response.status, text: await readBoundedText(response, signal),
        ...(options.includeMetadata ? {finalUrl:url.href,contentType:response.headers.get('content-type') ?? ''} : {}) };
    }

    throw policyError(`Feed exceeded the redirect limit (${MAX_REDIRECTS}).`);
  } finally {
    clearTimeout(timeout);
    controller.abort(new DOMException("Feed request completed.", "AbortError"));
  }
}

export async function fetchFeed(
  url: string,
  options: FeedFetchOptions = {},
) {
  const retries = Math.min(3, Math.max(0, options.retries ?? 2));
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Feed timeout must be a positive number.");
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchOnce(url, options, timeoutMs);
    } catch (error) {
      lastError = error;
      const status = (error as { httpStatus?: number }).httpStatus;
      const retryable = (error as { retryable?: boolean }).retryable !== false &&
        (status === undefined || status === 408 || status === 429 || status >= 500);
      if (!retryable || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }

  throw lastError;
}

export function collectFeedXml(
  database: KousatsuDatabase,
  source: SourceInput,
  xml: string,
  httpStatus = 200,
  existingFetchRunId?: string,
): CollectResult {
  database.upsertSource(source);
  const fetchRunId = existingFetchRunId ?? database.beginFetch(source.id);

  try {
    const parsed = parseFeed(xml);
    const fetchedAt = new Date().toISOString();
    const itemIds: string[] = [];
    let newItemCount = 0;

    database.transaction(() => {
      for (const entry of parsed.entries) {
        const canonicalUrl = canonicalizeUrl(entry.url);
        const stored: StoredItem = {
          ...entry,
          canonicalUrl,
          content:
            source.contentPolicy === "metadata-only" ? undefined : entry.content,
          contentHash: itemHash(entry),
          fetchedAt,
          id: randomUUID(),
          sourceId: source.id,
          summary:
            source.contentPolicy === "metadata-only" ? undefined : entry.summary,
          url: entry.url,
        };
          // A metadata refresh is not a retraction of a previously fetched body.
          // Preserve its content/version when the feed's document metadata agrees.
          const existing=database.getItemByCanonicalUrl(canonicalUrl);
          if(source.contentPolicy==='metadata-only'&&source.articlePolicy?.enabled&&existing?.content&&existing.sourceId===source.id&&existing.title===entry.title&&existing.publishedAt===entry.publishedAt&&database.documentCoverage(existing.versionId!)?.kind==='article-body'){
            stored.content=existing.content;stored.summary=existing.summary;stored.author=entry.author??existing.author;
          }
        const result = database.upsertItem(stored);
        itemIds.push(result.id);
        if (result.inserted) newItemCount += 1;
      }
    });

    const hash = responseHash(xml);
    database.finishFetch(fetchRunId, {
      httpStatus,
      itemCount: parsed.entries.length,
      newItemCount,
      responseHash: hash,
      status: "succeeded",
    });
    return {
      fetchRunId,
      itemIds: [...new Set(itemIds)],
      newItemCount,
      responseHash: hash,
      totalItemCount: parsed.entries.length,
    };
  } catch (error) {
    database.finishFetch(fetchRunId, {
      error: error instanceof Error ? error.message : String(error),
      httpStatus,
      status: "failed",
    });
    throw error;
  }
}

export async function collectRemoteFeed(
  database: KousatsuDatabase,
  source: SourceInput,
  options: FeedFetchOptions = {},
) {
  const result = await fetchFeed(source.feedUrl, options);
  return collectFeedXml(database, source, result.text, result.httpStatus);
}
