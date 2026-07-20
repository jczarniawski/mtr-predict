import { NextRequest, NextResponse } from "next/server";
import { getQuoteService } from "@/lib/broker";
import { HttpError, toErrorResponse } from "@/lib/api-helpers";

const MAX_SYMBOLS = 64;

/** Latest bid/ask for a comma-separated symbol list (served from the cache). */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("symbols") ?? "";
    const symbols = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (symbols.length === 0) throw new HttpError(400, "Pass ?symbols=A,B,C");
    if (symbols.length > MAX_SYMBOLS) throw new HttpError(400, `At most ${MAX_SYMBOLS} symbols.`);
    const quotes = await getQuoteService().getQuotes(symbols);
    return NextResponse.json({ quotes });
  } catch (e) {
    return toErrorResponse(e);
  }
}
