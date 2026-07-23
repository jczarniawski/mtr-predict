export type BrokerMode = "live" | "mock";

export interface AppEnv {
  /** REST base URL, no trailing slash. */
  brokerApiUrl: string;
  brokerToken: string;
  /** Trading-account group used for sign-ups and symbol lookups. */
  brokerGroup: string;
  /** host:port of the gRPC quote stream; empty string disables gRPC. */
  brokerGrpcHost: string;
  mode: BrokerMode;
  sessionSecret: string;
  demoInitialDeposit: number;
  disableDeposits: boolean;
}

export function getEnv(): AppEnv {
  const token = (process.env.BROKER_API_TOKEN ?? "").trim();
  const rawMode = (process.env.BROKER_MODE ?? "").trim().toLowerCase();
  const mode: BrokerMode =
    rawMode === "live" || rawMode === "mock" ? rawMode : token ? "live" : "mock";

  return {
    brokerApiUrl: (
      process.env.BROKER_API_URL ?? "https://broker-api-v2-demo.match-trader.com"
    ).replace(/\/+$/, ""),
    brokerToken: token,
    brokerGroup: (process.env.BROKER_GROUP ?? "testUSD").trim(),
    brokerGrpcHost: (
      process.env.BROKER_GRPC_HOST ?? "grpc-broker-api-v2-demo.match-trader.com:8083"
    ).trim(),
    mode,
    sessionSecret: resolveSessionSecret(mode),
    demoInitialDeposit: clampNumber(process.env.DEMO_INITIAL_DEPOSIT, 10_000, 1, 1_000_000),
    disableDeposits: (process.env.DISABLE_DEPOSITS ?? "").toLowerCase() === "true",
  };
}

/**
 * Session cookies are signed with this secret. In live mode we refuse to fall
 * back to a source-visible default: a known key lets anyone forge a session for
 * any account (and bypass any real auth layer put in front of the login route).
 */
function resolveSessionSecret(mode: BrokerMode): string {
  const secret = (process.env.SESSION_SECRET ?? "").trim();
  if (secret.length >= 16) return secret;
  if (mode === "live") {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a strong random value (at least 16 characters); " +
        "refusing to sign sessions with an insecure built-in default in live mode.",
    );
  }
  return secret || "dev-insecure-session-secret";
}

function clampNumber(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
