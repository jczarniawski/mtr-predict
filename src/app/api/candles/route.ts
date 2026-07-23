import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { HttpError, toErrorResponse } from "@/lib/api-helpers";
import type { Candle } from "@/lib/broker/types";

/** Chart ranges → candle interval + window. `size` stays ≤ 1000 (API limit). */
const RANGES: Record<string, { interval: string; ms: number; size: number }> = {
  "1d": { interval: "M5", ms: 86_400_000, size: 288 },
  "1w": { interval: "H1", ms: 7 * 86_400_000, size: 168 },
  "1m": { interval: "H4", ms: 30 * 86_400_000, size: 180 },
  all: { interval: "D1", ms: 365 * 86_400_000, size: 365 },
};

const MAX_SERIES = 6;
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 500;

interface Series {
  symbol: string;
  candles: Candle[];
}

// Small shared cache so N viewers polling the same chart don't multiply
// upstream candle calls (the 500 req/min budget is shared per token).
const cache = new Map<string, { ts: number; series: Series }>();

async function getSeries(
  symbol: string,
  rangeKey: string,
  range: (typeof RANGES)[string],
): Promise<Series> {
  const key = `${symbol}|${rangeKey}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.series;

  const res = await getBroker()
    .getCandles({
      symbol,
      interval: range.interval,
      from: new Date(now - range.ms).toISOString(),
      to: new Date(now).toISOString(),
      size: range.size,
    })
    .catch(() => null);
  const series: Series = { symbol, candles: res?.candles ?? [] };
  cache.set(key, { ts: now, series });
  if (cache.size > CACHE_MAX) {
    for (const k of cache.keys()) {
      cache.delete(k);
      if (cache.size <= CACHE_MAX) break;
    }
  }
  return series;
}

/**
 * Candle series for one or more symbols (comma-separated `symbols`, ≤ 6 — the
 * overlay chart's series cap). The legacy single `symbol` param still works.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const raw = sp.get("symbols") ?? sp.get("symbol") ?? "";
    const symbols = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
    if (symbols.length === 0) throw new HttpError(400, "Pass ?symbols=A,B,C");
    if (symbols.length > MAX_SERIES) throw new HttpError(400, `At most ${MAX_SERIES} symbols.`);

    const rangeKey = RANGES[sp.get("range") ?? "1w"] ? (sp.get("range") ?? "1w") : "1w";
    const range = RANGES[rangeKey];

    const series = await Promise.all(symbols.map((s) => getSeries(s, rangeKey, range)));
    return NextResponse.json({ range: rangeKey, interval: range.interval, series });
  } catch (e) {
    return toErrorResponse(e);
  }
}
