import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { getEnv } from "@/lib/env";
import { HttpError, parseBody, requireSession, toErrorResponse } from "@/lib/api-helpers";
import { toAccountView } from "@/lib/portfolio";

interface DepositBody {
  amount: number;
}

/**
 * Demo top-up. Deposits are NOT idempotent on the Broker API — this handler
 * never retries, and the UI disables the button while a request is in flight.
 */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    const env = getEnv();
    if (env.disableDeposits) throw new HttpError(403, "Top-ups are disabled on this site.");

    const body = await parseBody<DepositBody>(req);
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Enter an amount above zero.");
    if (amount > env.demoInitialDeposit) {
      throw new HttpError(400, `Top-ups are capped at ${env.demoInitialDeposit} per request.`);
    }

    const broker = getBroker();
    const account = await broker.getTradingAccount(session.login);
    if (account.accountType !== "DEMO") {
      throw new HttpError(403, "Top-ups are only available for DEMO accounts.");
    }

    // Per-request cap alone lets a user loop the endpoint to an unbounded
    // balance; also cap the resulting balance so top-ups stay demo-sized.
    const maxBalance = env.demoInitialDeposit * 10;
    const balance = account.financeInfo?.balance ?? 0;
    if (balance + amount > maxBalance) {
      throw new HttpError(
        400,
        `Demo balance is capped at ${maxBalance}. Current balance is ${Math.round(balance)}.`,
      );
    }

    await broker.deposit(session.login, amount);

    const updated = await broker.getTradingAccount(session.login);
    return NextResponse.json({ account: toAccountView(updated) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
