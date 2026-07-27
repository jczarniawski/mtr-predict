import { NextRequest, NextResponse } from "next/server";
import { getBroker } from "@/lib/broker";
import { getEnv } from "@/lib/env";
import { HttpError, parseBody, toErrorResponse } from "@/lib/api-helpers";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { toAccountView } from "@/lib/portfolio";
import { provisionDemoAccount } from "@/lib/onboarding";
import { isBrokerApiError } from "@/lib/broker/errors";

interface SignupBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a Broker API user account + a DEMO trading account, then attaches
 * this browser to the new login. Self-healing: if a previous attempt created
 * the user but the trading account failed, retrying the same email completes
 * the provisioning instead of dead-ending on "already exists".
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

    let result;
    try {
      result = await provisionDemoAccount(getBroker(), getEnv(), {
        email,
        password,
        firstName,
        lastName,
      });
    } catch (e) {
      // Duplicate created in a race between our pre-check and the create call.
      if (isBrokerApiError(e) && e.isConflict) {
        throw new HttpError(
          409,
          "This email is already registered. Switch to “Use existing login” and sign in with this email.",
        );
      }
      throw e;
    }

    if (result.kind === "exists") {
      throw new HttpError(
        409,
        "This email is already registered. Switch to “Use existing login” and sign in with this email.",
      );
    }

    const { account, userUuid } = result;
    const token = createSessionToken({
      login: account.login,
      uuid: userUuid,
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
