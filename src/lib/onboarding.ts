import { isBrokerApiError } from "@/lib/broker/errors";
import type { AppEnv } from "@/lib/env";
import type { BrokerClient, TradingAccount } from "@/lib/broker/types";

export interface SignupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export type ProvisionResult =
  /** Email already fully provisioned — sign in instead. */
  | { kind: "exists" }
  | {
      kind: "created";
      account: TradingAccount;
      userUuid: string;
      /** True when a half-finished earlier signup was completed. */
      repaired: boolean;
    };

/**
 * Sign-up provisioning with self-healing.
 *
 * Sign-up is two broker calls (create user account → create trading account),
 * and the second can fail after the first succeeded — leaving an email that is
 * "already registered" but has nothing to sign in to. This helper makes retry
 * work: an existing user WITHOUT any trading account is treated as a
 * half-finished signup and completed, instead of dead-ending on a 409.
 */
export async function provisionDemoAccount(
  broker: BrokerClient,
  env: AppEnv,
  input: SignupInput,
): Promise<ProvisionResult> {
  let user = await broker.getUserByEmail(input.email);
  let repaired = false;

  if (user) {
    const existing = await broker.getUserTradingAccounts(user.uuid);
    if (existing.length > 0) return { kind: "exists" };
    repaired = true; // user exists but has no trading account — finish the job
  } else {
    user = await broker.createUserAccount(input.email, input.password);
  }

  const account = await createTradingAccountWithFallback(broker, env, user.uuid, input);
  return { kind: "created", account, userUuid: user.uuid, repaired };
}

/**
 * Create the DEMO trading account, funded via `initialDeposit`. Some platform
 * builds reject bodies with fields they don't know (strict parsers surface
 * this as `400 "Failed to parse json."`) — most commonly `initialDeposit`.
 * On any 400, retry once with the fully-specified documented body WITHOUT
 * `initialDeposit`, then fund the account through the separate deposit
 * endpoint (called exactly once — it is not idempotent).
 */
async function createTradingAccountWithFallback(
  broker: BrokerClient,
  env: AppEnv,
  userUuid: string,
  input: SignupInput,
): Promise<TradingAccount> {
  const base = {
    group: env.brokerGroup,
    leverageRatioPercent: 100,
    accountType: "DEMO" as const,
    accessRight: "FULL",
  };

  try {
    return await broker.createTradingAccount(userUuid, {
      ...base,
      initialDeposit: env.demoInitialDeposit,
      accountDetails: { firstName: input.firstName, lastName: input.lastName },
    });
  } catch (e) {
    if (!(isBrokerApiError(e) && e.status === 400)) throw e;
    console.warn(
      `[signup] trading-account create rejected (${e.detail || e.title}); ` +
        "retrying with the fully-specified body and a separate deposit",
    );
  }

  const account = await broker.createTradingAccount(userUuid, {
    ...base,
    isProView: false,
    accountDetails: {
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: "",
      dateOfBirth: "",
      bankAccount: "",
      addressDetails: { address: "", country: "", state: "", city: "", zipCode: "" },
    },
  });

  try {
    await broker.deposit(account.login, env.demoInitialDeposit);
  } catch (e) {
    // Account exists but is unfunded — usable, and the portfolio top-up can
    // fund it. Never blind-retry a deposit.
    console.warn(`[signup] initial deposit failed for ${account.login}: ${(e as Error).message}`);
    return account;
  }
  return await broker.getTradingAccount(account.login).catch(() => account);
}
