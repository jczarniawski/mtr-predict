import { NextRequest, NextResponse } from "next/server";
import { getMarketService } from "@/lib/broker";
import { toErrorResponse } from "@/lib/api-helpers";

/**
 * Market data.
 * - `?view=home` → featured carousel + movers + category shelves (one call).
 * - otherwise    → flat list for the filtered grid: bets + outcomes + prices.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const markets = getMarketService();

    if (sp.get("view") === "home") {
      const home = await markets.getHomeView();
      return NextResponse.json({ home });
    }

    const [items, categories] = await Promise.all([
      markets.listMarkets({
        status: sp.get("status") ?? "ACTIVE",
        category: sp.get("category") ?? undefined,
        q: sp.get("q") ?? undefined,
        limit: Math.min(Math.max(Number(sp.get("limit")) || 60, 1), 120),
      }),
      markets.listCategories(),
    ]);
    return NextResponse.json({ markets: items, categories });
  } catch (e) {
    return toErrorResponse(e);
  }
}
