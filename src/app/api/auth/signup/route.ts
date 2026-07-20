import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { getEnv } from "@/lib/env";
import { HttpError, parseBody, toErrorResponse } from "@/lib/api-helpers";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { toAccountView } from "@/lib/portfolio";
import { isBrokerApiError } from "@/lib/broker/errors";

interface SignupBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a Broker API user account + a DEMO trading account funded with the
 * configured initial deposit, then attaches this browser to the new login.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await parseBody<SignupBody>(req);
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const firstName = (body.firstName ?? "").trim();
    const lastName = (body.lastName ?? "").trim();

    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      throw new HttpError(
        400,
        "Password must be 8+ characters with an uppercase letter, a lowercase letter and a digit.",
      );
    }
    if (!firstName || !lastName) throw new HttpError(400, "Enter your first and last name.");

    const broker = getBroker();
    const env = getEnv();

    // The API rejects duplicates with 409, but older builds silently minted a
    // new UUID — treat email as unique on our side and check first.
    const existing = await broker.getUserByEmail(email);
    if (existing) {
      throw new HttpError(
        409,
        "This email is already registered with the broker. Attach your existing trading account login instead.",
      );
    }

    let user;
    try {
      user = await broker.createUserAccount(email, password);
    } catch (e) {
      if (isBrokerApiError(e) && e.isConflict) {
        throw new HttpError(409, "This email is already registered with the broker.");
      }
      throw e;
    }

    const account = await broker.createTradingAccount(user.uuid, {
      group: env.brokerGroup,
      leverageRatioPercent: 100,
      accountType: "DEMO",
      accessRight: "FULL",
      initialDeposit: env.demoInitialDeposit,
      accountDetails: { firstName, lastName },
    });

    const token = createSessionToken({
      login: account.login,
      uuid: user.uuid,
      email,
      name: `${firstName} ${lastName}`,
    });
    const res = NextResponse.json({ account: toAccountView(account) });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
