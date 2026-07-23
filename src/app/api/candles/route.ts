import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { HttpError, toErrorResponse } from "@/lib/api-helpers";

/** Chart ranges → candle interval + window. `size` stays ≤ 1000 (API limit). */
const RANGES: Record<string, { interval: string; ms: number; size: number }> = {
  "1d": { interval: "M5", ms: 86_400_000, size: 288 },
  "1w": { interval: "H1", ms: 7 * 86_400_000, size: 168 },
  "1m": { interval: "H4", ms: 30 * 86_400_000, size: 180 },
  all: { interval: "D1", ms: 365 * 86_400_000, size: 365 },
};

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const symbol = sp.get("symbol")?.trim();
    if (!symbol) throw new HttpError(400, "Pass ?symbol=");
    const range = RANGES[sp.get("range") ?? "1w"] ?? RANGES["1w"];

    const to = new Date();
    const from = new Date(to.getTime() - range.ms);
    const res = await getBroker().getCandles({
      symbol,
      interval: range.interval,
      from: from.toISOString(),
      to: to.toISOString(),
      size: range.size,
    });
    return NextResponse.json({
      symbol: res.symbol,
      interval: res.interval,
      candles: res.candles ?? [],
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
