import { NextRequest, NextResponse } from "next/server";
import { getMarketService } from "@/lib/broker";
import { toErrorResponse } from "@/lib/api-helpers";

/** Market list for the home grid: bets + outcomes + latest prices. */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const markets = getMarketService();
    const [items, categories] = await Promise.all([
      markets.listMarkets({
        status: sp.get("status") ?? "ACTIVE",
        category: sp.get("category") ?? undefined,
        q: sp.get("q") ?? undefined,
        limit: Math.min(Number(sp.get("limit")) || 60, 120),
      }),
      markets.listCategories(),
    ]);
    return NextResponse.json({ markets: items, categories });
  } catch (e) {
    return toErrorResponse(e);
  }
}
