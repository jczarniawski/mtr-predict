import { GrpcQuoteFeed } from "@/lib/broker/grpc-quotes";
import type { BrokerClient, Quote } from "@/lib/broker/types";

const REST_QUOTE_TTL_MS = 15_000;
const REST_COOLDOWN_MS = 10_000;
const REST_BURST_LIMIT = 12;
const MAX_CACHED_QUOTES = 5_000; // bound memory over long uptime with bet churn

/**
 * Server-side quote cache shared by every request.
 *
 * Live mode: primary source is the gRPC quotations stream (pushed into the
 * cache as prices tick); symbols the stream hasn't delivered yet fall back to
 * REST candles, bounded by per-symbol cooldowns so a busy homepage can't eat
 * the 500 req/min budget. Mock mode: straight to the simulator.
 */
export class QuoteService {
  private cache = new Map<string, Quote>();
  private restCooldown = new Map<string, number>();
  private feed: GrpcQuoteFeed | null = null;

  constructor(
    private readonly broker: BrokerClient,
    grpcHost: string,
    token: string,
  ) {
    if (broker.mode === "live" && grpcHost && token) {
      this.feed = new GrpcQuoteFeed(grpcHost, token, (q) => {
        this.cache.set(q.symbol, q);
      });
    }
  }

  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    const unique = [...new Set(symbols)].filter(Boolean);
    if (unique.length === 0) return {};

    if (this.broker.mode === "mock") {
      const quotes = await this.broker.getQuotes(unique);
      return Object.fromEntries(quotes.map((q) => [q.symbol, q]));
    }

    this.feed?.ensureSymbols(unique);

    const now = Date.now();
    const missing = unique
      .filter((s) => {
        const q = this.cache.get(s);
        if (!q) return true;
        // gRPC quotes stay valid until replaced (stream only ticks on change);
        // REST approximations go stale.
        return q.source === "rest" && now - q.ts > REST_QUOTE_TTL_MS;
      })
      .filter((s) => (this.restCooldown.get(s) ?? 0) <= now)
      .slice(0, REST_BURST_LIMIT);

    if (missing.length > 0) {
      for (const s of missing) this.restCooldown.set(s, now + REST_COOLDOWN_MS);
      try {
        const fetched = await this.broker.getQuotes(missing);
        for (const q of fetched) {
          const existing = this.cache.get(q.symbol);
          if (!existing || existing.source !== "grpc") this.cache.set(q.symbol, q);
        }
      } catch (e) {
        console.warn(`[quotes] REST fallback failed: ${(e as Error).message}`);
      }
    }

    const out: Record<string, Quote> = {};
    for (const s of unique) {
      const q = this.cache.get(s);
      if (q) out[s] = q;
    }
    this.evict(now);
    return out;
  }

  /** Drop expired cooldown entries and bound the quote cache. */
  private evict(now: number): void {
    for (const [s, until] of this.restCooldown) {
      if (until <= now) this.restCooldown.delete(s);
    }
    if (this.cache.size > MAX_CACHED_QUOTES) {
      // Map preserves insertion order — drop the oldest-inserted entries.
      const excess = this.cache.size - MAX_CACHED_QUOTES;
      let i = 0;
      for (const key of this.cache.keys()) {
        this.cache.delete(key);
        if (++i >= excess) break;
      }
    }
  }

  /** Stop the gRPC feed and release caches (called when services are rebuilt). */
  dispose(): void {
    this.feed?.dispose();
    this.feed = null;
    this.cache.clear();
    this.restCooldown.clear();
  }
}
