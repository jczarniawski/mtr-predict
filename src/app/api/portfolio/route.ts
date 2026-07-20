import { NextRequest, NextResponse } from "next/server";
import { requireSession, toErrorResponse } from "@/lib/api-helpers";
import { getPortfolio } from "@/lib/portfolio";

/** Account summary + open positions (with live P&L) + trade history. */
export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    const portfolio = await getPortfolio(session.login);
    return NextResponse.json({ portfolio });
  } catch (e) {
    return toErrorResponse(e);
  }
}
