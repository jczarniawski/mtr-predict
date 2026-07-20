import { NextRequest, NextResponse } from "next/server";
import { isBrokerApiError } from "@/lib/broker/errors";
import { SESSION_COOKIE, verifySessionToken, type Session } from "@/lib/session";

export function readSession(req: NextRequest): Session | null {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export function requireSession(req: NextRequest): Session {
  const session = readSession(req);
  if (!session) throw new HttpError(401, "Sign in to trade.", "unauthenticated");
  return session;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Uniform error mapping for route handlers. Broker auth failures are the
 * server's token problem, not the visitor's — surface them as 502.
 */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return jsonError(e.status, e.message, e.code);
  if (isBrokerApiError(e)) {
    const status = e.isAuth || e.isPermission ? 502 : e.status >= 500 ? 502 : e.status;
    return jsonError(status, e.userMessage, e.errorType);
  }
  console.error("[api] unexpected error:", e);
  return jsonError(500, "Something went wrong. Please try again.");
}

export async function parseBody<T>(req: NextRequest): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}
