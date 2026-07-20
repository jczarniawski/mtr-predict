import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { getEnv } from "@/lib/env";
import { readSession, toErrorResponse } from "@/lib/api-helpers";
import { toAccountView } from "@/lib/portfolio";
import { isBrokerApiError } from "@/lib/broker/errors";

/** Current session + live account state (equity, balance) for the nav chip. */
export async function GET(req: NextRequest) {
  const env = getEnv();
  const base = { mode: env.mode, depositsEnabled: !env.disableDeposits };
  try {
    const session = readSession(req);
    if (!session) return NextResponse.json({ ...base, account: null });
    try {
      const account = await getBroker().getTradingAccount(session.login);
      return NextResponse.json({ ...base, account: toAccountView(account) });
    } catch (e) {
      // account deleted upstream → treat as signed out rather than erroring
      if (isBrokerApiError(e) && e.isNotFound) {
        return NextResponse.json({ ...base, account: null });
      }
      throw e;
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
