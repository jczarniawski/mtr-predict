import { NextRequest, NextResponse } from "next/server";
import { getBroker, getMarketService } from "@/lib/broker";
import { HttpError, parseBody, requireSession, toErrorResponse } from "@/lib/api-helpers";
import { clampVolume } from "@/lib/money";
import { toAccountView } from "@/lib/portfolio";

interface OpenBody {
  /** PRED instrument, e.g. an outcome's instrumentYesName or instrumentNoName. */
  symbol: string;
  /** Number of contracts (lots). */
  volume: number;
}

/**
 * Buy a YES/NO prediction instrument at market.
 * The Kalshi model maps to the engine as: "buy Yes" → BUY instrumentYesName,
 * "buy No" → BUY instrumentNoName. Exits go through /api/trade/close.
 */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    const body = await parseBody<OpenBody>(req);
    const symbol = (body.symbol ?? "").trim();
    if (!symbol) throw new HttpError(400, "Missing symbol.");
    const requested = Number(body.volume);
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new HttpError(400, "Enter a contract amount above zero.");
    }

    const broker = getBroker();
    const markets = getMarketService();

    // Snap the volume to the instrument's contract rules before sending.
    const infos = await markets.getSymbolInfos([symbol]);
    const info = infos.get(symbol);
    const volume = clampVolume(requested, info);
    if (volume <= 0) {
      throw new HttpError(400, `Amount is below this market's minimum (${info?.volumeMin ?? 1}).`);
    }
    if (info?.sessionOpen === false) {
      throw new HttpError(400, "This market is closed for trading.");
    }

    // A 200 is an acknowledgement ("accepted"), not a fill confirmation.
    const ack = await broker.openPosition({
      login: session.login,
      symbol,
      orderSide: "BUY",
      volume,
      comment: "MTR Predict web",
    });
    const failed = ack.partialResponses?.find((p) => p.errorMessage);
    if (failed?.errorMessage) throw new HttpError(400, failed.errorMessage);

    const account = await broker.getTradingAccount(session.login).catch(() => null);
    return NextResponse.json({
      accepted: true,
      orderId: ack.orderId ?? null,
      volume,
      account: account ? toAccountView(account) : null,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
