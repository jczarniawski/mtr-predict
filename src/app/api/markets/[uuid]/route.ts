import { NextRequest, NextResponse } from "next/server";
import { getMarketService } from "@/lib/broker";
import { toErrorResponse } from "@/lib/api-helpers";

/** One market with all outcomes and both YES/NO prices. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ uuid: string }> },
) {
  try {
    const { uuid } = await ctx.params;
    const market = await getMarketService().getMarket(uuid);
    return NextResponse.json({ market });
  } catch (e) {
    return toErrorResponse(e);
  }
}
