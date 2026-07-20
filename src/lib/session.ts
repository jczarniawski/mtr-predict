import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Minimal stateless session: an HMAC-signed cookie carrying the trading-account
 * login this browser is attached to. No database involved — the Broker API is
 * the source of truth for everything else.
 */

export const SESSION_COOKIE = "mtrp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Session {
  /** Trading-account login (numeric string). */
  login: string;
  /** User-account UUID, when known. */
  uuid?: string;
  email?: string;
  name?: string;
  iat: number;
  exp: number;
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(
  data: Omit<Session, "iat" | "exp">,
  now = Date.now(),
  secret = getEnv().sessionSecret,
): string {
  const session: Session = { ...data, iat: now, exp: now + SESSION_TTL_MS };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  now = Date.now(),
  secret = getEnv().sessionSecret,
): Session | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof session.login !== "string" || !session.login) return null;
    if (typeof session.exp !== "number" || session.exp < now) return null;
    return session;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_MS / 1000,
};
