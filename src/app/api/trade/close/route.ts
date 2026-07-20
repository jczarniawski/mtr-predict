import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { HttpError, parseBody, requireSession, toErrorResponse } from "@/lib/api-helpers";
import { toAccountView } from "@/lib/portfolio";

interface CloseBody {
  positionId: string;
  /** Contracts to close; omit to close the whole position. */
  volume?: number;
}

/** Sell out of a position (fully, or partially when volume is given). */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    const body = await parseBody<CloseBody>(req);
    const positionId = (body.positionId ?? "").trim();
    if (!positionId) throw new HttpError(400, "Missing positionId.");

    const broker = getBroker();

    // Verify the position belongs to this session's account before acting.
    const accounts = await broker.getOpenPositions(session.login);
    const positions = accounts.find((a) => a.login === session.login)?.positions ?? [];
    const position = positions.find((p) => p.id === positionId);
    if (!position) throw new HttpError(404, "Position not found on your account.");

    const volume = body.volume === undefined ? undefined : Number(body.volume);
    if (volume !== undefined && (!Number.isFinite(volume) || volume <= 0)) {
      throw new HttpError(400, "Invalid amount to sell.");
    }

    if (volume !== undefined && volume < position.volume) {
      const ack = await broker.closePartially({
        login: session.login,
        positionId,
        volume,
        comment: "MTR Predict web",
      });
      const failed = ack.partialResponses?.find((p) => p.errorMessage);
      if (failed?.errorMessage) throw new HttpError(400, failed.errorMessage);
    } else {
      const ack = await broker.closePositions(session.login, [
        { positionId, comment: "MTR Predict web" },
      ]);
      // Bulk ops return 200 with per-item results — any errorMessage is a failure.
      const failed = ack.partialResponses?.find((p) => p.errorMessage);
      if (failed?.errorMessage) throw new HttpError(400, failed.errorMessage);
    }

    const account = await broker.getTradingAccount(session.login).catch(() => null);
    return NextResponse.json({
      accepted: true,
      account: account ? toAccountView(account) : null,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
