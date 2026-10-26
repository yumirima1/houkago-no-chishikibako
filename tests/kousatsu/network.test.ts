import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";

import { fetchFeed, type FeedFetchOptions } from "../../src/lib/kousatsu/ingest";

type RequestAdapter = NonNullable<FeedFetchOptions["requestImpl"]>;
const publicAddress = { address: "93.184.216.36", family: 4 };
const publicResolver = async () => [publicAddress];

function transport(
  response: { status?: number; headers?: Record<string, string>; chunks?: readonly Uint8Array[]; stalled?: boolean },
  inspect: (url: URL, options: Parameters<RequestAdapter>[1]) => void = () => {},
): RequestAdapter {
  return (url, options, callback) => {
    inspect(url, options);
    const incoming = (response.stalled ? new Readable({ read() {} }) : Readable.from(response.chunks ?? [Buffer.from("<rss/>")])) as IncomingMessage;
    incoming.statusCode = response.status ?? 200;
    incoming.headers = response.headers ?? {};
    const request = new EventEmitter() as ClientRequest;
    request.end = (() => { queueMicrotask(() => callback(incoming)); return request; }) as ClientRequest["end"];
    request.destroy = ((error?: Error) => {
      incoming.destroy();
      if (error) queueMicrotask(() => request.emit("error", error));
      return request;
    }) as ClientRequest["destroy"];
    options.signal?.addEventListener("abort", () => request.destroy(options.signal?.reason), { once: true });
    return request;
  };
}

test("feed retrieval retries transient errors and stops at its limit", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls < 3) return new Response("temporary", { status: 503 });
    return new Response("<rss><channel><title>x</title></channel></rss>", {
      headers: { "content-type": "application/rss+xml" },
      status: 200,
    });
  };
  const result = await fetchFeed("https://93.184.216.34/feed.xml", {
    fetchImpl,
    retries: 2,
    timeoutMs: 1_000,
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(calls, 3);
});

test("feed retrieval enforces timeout", async () => {
  const fetchImpl: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  await assert.rejects(
    () =>
      fetchFeed("https://93.184.216.35/feed.xml", {
        fetchImpl,
        retries: 0,
        timeoutMs: 20,
      }),
    /timeout|aborted|abort/i,
  );
});

test("feed retrieval rejects local network targets before fetch", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("unexpected");
  };
  await assert.rejects(
    () => fetchFeed("https://127.0.0.1/feed.xml", { fetchImpl, retries: 0 }),
    /private or unsupported/,
  );
  assert.equal(called, false);
});

test("production transport pins validated DNS answers while retaining original HTTPS identity", async () => {
  let resolutions = 0;
  let transports = 0;
  const result = await fetchFeed("https://rebind.example.invalid:8443/feed?q=1", {
    retries: 0,
    resolveHostname: async () => ++resolutions === 1 ? [publicAddress] : [{ address: "127.0.0.1", family: 4 }],
    requestImpl: transport({}, (url, options) => {
      transports += 1;
      assert.equal(url.hostname, "rebind.example.invalid");
      assert.equal(options.servername, url.hostname);
      assert.equal(options.agent, false);
      assert.notEqual(options.rejectUnauthorized, false);
      assert.equal((options.headers as Record<string, string>).Host, "rebind.example.invalid:8443");
      assert.equal((options.headers as Record<string, string>)["Accept-Encoding"], "identity");
      for (const all of [false, true]) {
        options.lookup!(url.hostname, { all }, (error, address, family) => {
          assert.equal(error, null);
          if (all) assert.deepEqual(address, [publicAddress]);
          else { assert.equal(address, publicAddress.address); assert.equal(family, 4); }
        });
      }
      options.lookup!("unexpected.example.invalid", {}, (error, addresses) => {
        assert.match(error!.message, /hostname mismatch/);
        assert.deepEqual(addresses, []);
      });
    }),
  });
  assert.equal(result.text, "<rss/>");
  assert.equal(resolutions, 1, "the socket's lookup never asks the changing resolver again");
  assert.equal(transports, 1);
});

test("private and mixed DNS answers never reach the transport, including redirects", async () => {
  let requests = 0;
  const requestImpl = transport({ status: 302, headers: { location: "https://private.example.invalid/feed" } }, () => { requests += 1; });
  await assert.rejects(fetchFeed("https://redirect-safe.example.invalid/feed", {
    retries: 0, requestImpl,
    resolveHostname: async (hostname) => hostname === "private.example.invalid" ? [{ address: "10.0.0.1", family: 4 }] : [publicAddress],
  }), /private or unsupported/);
  assert.equal(requests, 1, "redirect destination is validated before making its request");
  await assert.rejects(fetchFeed("https://mixed.example.invalid/feed", {
    retries: 0, requestImpl,
    resolveHostname: async () => [publicAddress, { address: "169.254.169.254", family: 4 }],
  }), /private or unsupported/);
  assert.equal(requests, 1);
  await assert.rejects(fetchFeed("https://[::1]/feed", { retries: 0, requestImpl }), /private or unsupported/);
  assert.equal(requests, 1);
});

test("the whole-attempt deadline includes DNS and never connects after a late DNS resolution", { timeout: 2000 }, async () => {
  let release!: () => void;
  let requests = 0;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await assert.rejects(fetchFeed("https://slow-dns.example.invalid/feed", {
    timeoutMs: 20, retries: 0,
    resolveHostname: async () => { await pending; return [publicAddress]; },
    requestImpl: transport({}, () => { requests += 1; }),
  }), /timed out|timeout|abort/i);
  release();
  await pending;
  assert.equal(requests, 0);
});

test("late DNS rejection after an elapsed deadline is handled without an unhandled rejection", { timeout: 2000 }, async () => {
  let rejectDns!: (error: Error) => void;
  const pending = new Promise<Array<typeof publicAddress>>((_resolve, reject) => { rejectDns = reject; });
  await assert.rejects(fetchFeed("https://rejecting-dns.example.invalid/feed", {
    timeoutMs: 20, retries: 0, resolveHostname: () => pending,
    requestImpl: transport({}, () => assert.fail("expired lookup must never connect")),
  }), /timed out|timeout|abort/i);
  rejectDns(new Error("DNS failed after the caller already timed out."));
  await new Promise<void>((resolve) => setImmediate(resolve));
});

test("the attempt deadline also bounds a transport that never returns headers", { timeout: 2000 }, async () => {
  let signal: AbortSignal | undefined;
  const requestImpl: RequestAdapter = (_url, options) => {
    signal = options.signal;
    const request = new EventEmitter() as ClientRequest;
    request.end = (() => request) as ClientRequest["end"];
    return request;
  };
  await assert.rejects(fetchFeed("https://headers-stall.example.invalid/feed", {
    timeoutMs: 20, retries: 0, resolveHostname: publicResolver, requestImpl,
  }), /timed out|timeout|abort/i);
  assert.equal(signal?.aborted, true);
});

test("the whole-attempt deadline includes host rate waiting", { timeout: 2000 }, async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  let requests = 0;
  const options = { retries: 0, resolveHostname: publicResolver, requestImpl: transport({}, () => { requests += 1; }) };
  await fetchFeed("https://rate-deadline.example.invalid/feed", options);
  await assert.rejects(fetchFeed("https://rate-deadline.example.invalid/feed", { ...options, timeoutMs: 20 }), /timed out|timeout|abort/i);
  assert.equal(requests, 1);
});

test("a response whose headers arrive but body stalls is cancelled at the attempt deadline", { timeout: 2000 }, async () => {
  await assert.rejects(fetchFeed("https://slow-body.example.invalid/feed", {
    timeoutMs: 20, retries: 0, resolveHostname: publicResolver,
    requestImpl: transport({ stalled: true }),
  }), /timed out|timeout|abort/i);
});

test("native transport enforces declared and streamed 2MiB limits and rejects unwanted compression", async () => {
  for (const [index, response, expected] of [
    [0, { headers: { "content-length": String(2 * 1024 * 1024 + 1) } }, /byte limit/],
    [1, { chunks: [Buffer.alloc(1024 * 1024), Buffer.alloc(1024 * 1024 + 1)] }, /byte limit/],
    [2, { headers: { "content-encoding": "gzip" }, chunks: [Buffer.from("compressed input")] }, /Compressed feed/],
  ] as const) {
    let requests = 0;
    await assert.rejects(fetchFeed(`https://limit-${index}.example.invalid/feed`, {
      retries: 2, resolveHostname: publicResolver,
      requestImpl: transport(response, () => { requests += 1; }),
    }), expected);
    assert.equal(requests, 1, "policy failures do not repeatedly download unsafe payloads");
  }
});

test("each redirect revalidates its destination and the fourth redirect stops the request", async () => {
  let requests = 0;
  let resolutions = 0;
  const requestImpl: RequestAdapter = (url, options, callback) => {
    const next = ++requests;
    return transport({ status: 302, headers: { location: `https://hop-${next}.example.invalid/feed` } })(url, options, callback);
  };
  await assert.rejects(fetchFeed("https://redirect-limit.example.invalid/feed", {
    retries: 0, requestImpl,
    resolveHostname: async () => { resolutions += 1; return [publicAddress]; },
  }), /redirect limit/);
  assert.equal(requests, 4);
  assert.equal(resolutions, 4);
});

test("invalid remote status values become a controlled retrieval failure", async () => {
  await assert.rejects(fetchFeed("https://invalid-status.example.invalid/feed", {
    retries: 0, resolveHostname: publicResolver, requestImpl: transport({ status: 700 }),
  }), /status|range/i);
});
