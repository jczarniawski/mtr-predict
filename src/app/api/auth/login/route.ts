import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { HttpError, parseBody, toErrorResponse } from "@/lib/api-helpers";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { toAccountView } from "@/lib/portfolio";
import { isBrokerApiError } from "@/lib/broker/errors";

interface LoginBody {
  login: string;
}

/**
 * Attach this browser to an existing trading-account login.
 *
 * Note: the Broker API is an administrative API — it has no end-user password
 * check, so this demo attaches by login only. Put real authentication in
 * front of this route before exposing the site beyond a demo.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody<LoginBody>(req);
    const login = (body.login ?? "").trim();
    if (!/^\d{1,12}$/.test(login)) {
      throw new HttpError(400, "Enter your numeric trading-account login.");
    }

    let account;
    try {
      account = await getBroker().getTradingAccount(login);
    } catch (e) {
      if (isBrokerApiError(e) && (e.isNotFound || e.status === 400)) {
        throw new HttpError(404, `No trading account found for login ${login}.`);
      }
      throw e;
    }

    const view = toAccountView(account);
    const token = createSessionToken({ login: account.login, name: view.name });
    const res = NextResponse.json({ account: view });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
