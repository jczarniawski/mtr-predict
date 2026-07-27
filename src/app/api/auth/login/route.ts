import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { HttpError, parseBody, toErrorResponse } from "@/lib/api-helpers";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { toAccountView } from "@/lib/portfolio";
import { isBrokerApiError } from "@/lib/broker/errors";
import type { TradingAccount } from "@/lib/broker/types";

interface LoginBody {
  /** Email address or numeric trading-account login. */
  identifier?: string;
  /** Back-compat alias. */
  login?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_RE = /^\d{1,12}$/;

/**
 * Attach this browser to a trading account, by the numeric login or by the
 * email used at sign-up (resolved via the user account's trading accounts).
 *
 * Note: the Broker API is an administrative API — it has no end-user password
 * check, so this demo attaches by identifier only. Put real authentication in
 * front of this route before exposing the site beyond a demo.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody<LoginBody>(req);
    const identifier = (body.identifier ?? body.login ?? "").trim();
    const broker = getBroker();

    let account: TradingAccount;
    let email: string | undefined;
    let uuid: string | undefined;

    if (LOGIN_RE.test(identifier)) {
      try {
        account = await broker.getTradingAccount(identifier);
      } catch (e) {
        if (isBrokerApiError(e) && (e.isNotFound || e.status === 400)) {
          throw new HttpError(404, `No trading account found for login ${identifier}.`);
        }
        throw e;
      }
    } else if (EMAIL_RE.test(identifier)) {
      email = identifier.toLowerCase();
      const user = await broker.getUserByEmail(email);
      if (!user) {
        throw new HttpError(
          404,
          "No account is registered with this email. Create one via Sign up.",
        );
      }
      uuid = user.uuid;
      const accounts = await broker.getUserTradingAccounts(user.uuid);
      if (accounts.length === 0) {
        throw new HttpError(404, "This email has no trading account yet. Create one via Sign up.");
      }
      // Newest first, so a returning user lands on their most recent account.
      account = [...accounts].sort((a, b) => ((b.created ?? "") < (a.created ?? "") ? -1 : 1))[0];
    } else {
      throw new HttpError(400, "Enter your email address or numeric trading-account login.");
    }

    const view = toAccountView(account);
    const token = createSessionToken({ login: account.login, uuid, email, name: view.name });
    const res = NextResponse.json({ account: view });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
