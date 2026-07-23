import path from "node:path";
import type { Quote } from "@/lib/broker/types";

/**
 * Live price feed over the Broker API v2 gRPC quotations stream
 * (QuotationsServiceExternal.getQuotationsWithMarkupStream).
 *
 * One long-lived server-side stream covers every symbol the frontend has asked
 * about; quotes are pushed into the QuoteService cache, so REST is never
 * polled for prices while the stream is healthy. Auth goes in gRPC metadata
 * (`authorization: Bearer …`), TLS on public hosts, heartbeat ~every 30s.
 */

type OnQuote = (q: Quote) => void;

const RESTART_DEBOUNCE_MS = 300;
const MAX_BACKOFF_MS = 30_000;
const FAILURE_DISABLE_THRESHOLD = 6;
const DISABLE_WINDOW_MS = 5 * 60_000;
const HEARTBEAT_TIMEOUT_MS = 90_000; // 3 missed heartbeats → assume dead

const MAX_WANTED = 500; // cap the subscribed-symbol set (LRU by last request)

export class GrpcQuoteFeed {
  /** symbol → last-requested epoch ms; bounded + LRU-evicted. */
  private wanted = new Map<string, number>();
  private stream: { cancel(): void } | null = null;
  private streamSymbols = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private backoffMs = 1_000;
  private failures = 0;
  private disabledUntil = 0;
  private starting = false;

  constructor(
    private readonly host: string,
    private readonly token: string,
    private readonly onQuote: OnQuote,
  ) {}

  /** True while a stream is up — callers can skip REST fallback for fresh data. */
  get healthy(): boolean {
    return this.stream !== null;
  }

  get available(): boolean {
    return Date.now() >= this.disabledUntil;
  }

  /** Register interest in symbols; (re)starts the stream when the set grows. */
  ensureSymbols(symbols: string[]): void {
    const now = Date.now();
    let grew = false;
    for (const s of symbols) {
      if (!s) continue;
      if (!this.wanted.has(s)) grew = true;
      this.wanted.set(s, now); // refresh recency
    }
    // Evict least-recently-requested symbols beyond the cap so a long-running
    // server that browses many markets doesn't grow the set (and the stream
    // payload) without bound.
    if (this.wanted.size > MAX_WANTED) {
      const byRecency = [...this.wanted.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < this.wanted.size - MAX_WANTED; i++) {
        this.wanted.delete(byRecency[i][0]);
      }
    }
    if (this.wanted.size === 0) return;
    if (grew || (!this.stream && !this.starting)) this.scheduleRestart();
  }

  /** Permanently stop this feed (called when the services singleton is replaced). */
  dispose(): void {
    this.disabledUntil = Number.MAX_SAFE_INTEGER; // `available` stays false → no restart
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.stopStream();
    this.wanted.clear();
  }

  private scheduleRestart(delay = RESTART_DEBOUNCE_MS): void {
    if (this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start();
    }, delay);
    // don't hold the process open just for a pending reconnect
    this.restartTimer.unref?.();
  }

  private async start(): Promise<void> {
    if (this.starting || !this.available || this.wanted.size === 0) return;
    this.starting = true;
    try {
      const { grpc, service } = await loadGrpc();
      this.stopStream();

      const client = getClient(grpc, service, this.host);
      const metadata = new grpc.Metadata();
      metadata.set("authorization", `Bearer ${this.token}`);

      const symbols = [...this.wanted.keys()];
      const call = client.getQuotationsWithMarkupStream(
        { symbols, throttlingMs: 1000, smartThrottling: true },
        metadata,
      );
      this.stream = call;
      this.streamSymbols = symbols.length;
      this.armWatchdog();

      call.on("data", (msg: GrpcQuotationMessage) => {
        this.armWatchdog();
        const q = msg?.quotation;
        if (!q?.symbol) return; // heartbeat
        this.failures = 0;
        this.backoffMs = 1_000;
        this.onQuote({
          symbol: q.symbol,
          // proto-loader is configured with defaults:false, so a legitimate
          // 0.00 price (a near-certain outcome's losing side) is omitted from
          // the message — coerce the absent field to 0, not NaN.
          bid: Number(q.bidPrice ?? 0),
          ask: Number(q.askPrice ?? 0),
          ts: Number(q.timestampInMillis) || Date.now(),
          dailyChange:
            q.dailyStatistics?.change !== undefined ? Number(q.dailyStatistics.change) : undefined,
          source: "grpc",
        });
      });
      const onDrop = () => this.handleDrop(call);
      call.on("error", onDrop);
      call.on("end", onDrop);
    } catch (e) {
      console.warn(`[quotes] gRPC stream start failed: ${(e as Error).message}`);
      this.handleDrop(null);
    } finally {
      this.starting = false;
      // the wanted set may have grown while connecting
      if (this.stream && this.wanted.size > this.streamSymbols) this.scheduleRestart();
    }
  }

  private armWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      console.warn("[quotes] gRPC heartbeats stopped; reconnecting");
      this.handleDrop(this.stream);
    }, HEARTBEAT_TIMEOUT_MS);
    this.watchdog.unref?.();
  }

  private handleDrop(call: { cancel(): void } | null): void {
    if (call && this.stream !== call) return; // stale callback from a replaced stream
    this.stopStream();
    this.failures++;
    if (this.failures >= FAILURE_DISABLE_THRESHOLD) {
      this.disabledUntil = Date.now() + DISABLE_WINDOW_MS;
      this.failures = 0;
      console.warn("[quotes] gRPC feed disabled for 5 minutes after repeated failures; REST fallback in use");
      return;
    }
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.scheduleRestart(this.backoffMs);
  }

  private stopStream(): void {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = null;
    }
    if (this.stream) {
      try {
        this.stream.cancel();
      } catch {
        // already closed
      }
      this.stream = null;
    }
  }
}

interface GrpcQuotationMessage {
  quotation?: {
    symbol?: string;
    bidPrice?: number;
    askPrice?: number;
    timestampInMillis?: number | string;
    dailyStatistics?: { change?: number; high?: number; low?: number };
  };
  heartbeat?: boolean;
}

// ── lazy grpc loading (kept out of the bundle; only used in live mode) ───────

type GrpcModule = typeof import("@grpc/grpc-js");

let loaded: Promise<{ grpc: GrpcModule; service: ServiceCtor }> | null = null;
type ServiceCtor = new (
  host: string,
  creds: unknown,
) => {
  getQuotationsWithMarkupStream: (
    req: unknown,
    md: unknown,
  ) => { cancel(): void; on(ev: string, cb: (arg?: never) => void): void } & {
    on(ev: "data", cb: (msg: GrpcQuotationMessage) => void): void;
  };
};

async function loadGrpc() {
  loaded ??= (async () => {
    const grpc = await import("@grpc/grpc-js");
    const protoLoader = await import("@grpc/proto-loader");
    const protoPath = path.join(process.cwd(), "proto", "broker_api_v2.proto");
    const def = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: Number,
      enums: String,
      defaults: false,
      oneofs: true,
    });
    const pkg = grpc.loadPackageDefinition(def) as unknown as {
      com: {
        matchtrade: { mtr: { broker_api: { grpc: { QuotationsServiceExternal: ServiceCtor } } } };
      };
    };
    return {
      grpc,
      service: pkg.com.matchtrade.mtr.broker_api.grpc.QuotationsServiceExternal,
    };
  })();
  return loaded;
}

const clients = new Map<string, InstanceType<ServiceCtor>>();

function getClient(grpc: GrpcModule, Service: ServiceCtor, host: string) {
  let client = clients.get(host);
  if (!client) {
    client = new Service(host, grpc.credentials.createSsl());
    clients.set(host, client);
  }
  return client;
}
