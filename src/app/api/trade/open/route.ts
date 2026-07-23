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

    // This site trades prediction markets only. Require the symbol to resolve to
    // a known YES/NO outcome instrument — this blocks opening arbitrary broker
    // symbols (e.g. a leveraged FOREX position whose real margin the PRED-model
    // cost/payout UI would badly misrepresent), independent of trading group.
    const refs = await markets.resolveSymbols([symbol]);
    const ref = refs.get(symbol);
    if (!ref) {
      throw new HttpError(400, "Unknown market instrument — only prediction outcomes are tradable here.");
    }
    if (ref.betStatus === "RESOLVED") {
      throw new HttpError(400, "This market has resolved and is closed for trading.");
    }

    // Snap the volume to the instrument's contract rules before sending.
    const infos = await markets.getSymbolInfos([symbol]);
    const info = infos.get(symbol);
    // Defensive: never trade a non-PRED instrument even if it were indexed.
    if (info?.type && info.type !== "PRED") {
      throw new HttpError(400, "Only prediction-market instruments can be traded here.");
    }
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
