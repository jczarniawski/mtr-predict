import { beforeEach, describe, expect, it } from "vitest";
import { MockBrokerClient, resetMockStore } from "@/lib/broker/mock";
import { BrokerApiError } from "@/lib/broker/errors";
import { provisionDemoAccount } from "@/lib/onboarding";
import type { AppEnv } from "@/lib/env";
import type { CreateTradingAccountRequest, TradingAccount } from "@/lib/broker/types";

const env = {
  brokerGroup: "predUSD",
  demoInitialDeposit: 10_000,
} as AppEnv;

const input = {
  email: "new@example.com",
  password: "Abcd1234",
  firstName: "New",
  lastName: "Trader",
};

let broker: MockBrokerClient;

beforeEach(() => {
  resetMockStore();
  broker = new MockBrokerClient();
});

describe("provisionDemoAccount", () => {
  it("creates user + funded trading account (happy path)", async () => {
    const res = await provisionDemoAccount(broker, env, input);
    if (res.kind !== "created") throw new Error("expected created");
    expect(res.repaired).toBe(false);
    expect(res.account.financeInfo?.balance).toBe(10_000);
    expect((await broker.getUserByEmail(input.email))?.uuid).toBe(res.userUuid);
  });

  it("returns 'exists' for a fully provisioned email", async () => {
    await provisionDemoAccount(broker, env, input);
    const again = await provisionDemoAccount(broker, env, input);
    expect(again.kind).toBe("exists");
  });

  it("repairs a half-finished signup (user exists, no trading account)", async () => {
    // Simulate the failure mode: user account created, trading account never was.
    await broker.createUserAccount(input.email, input.password);

    const res = await provisionDemoAccount(broker, env, input);
    if (res.kind !== "created") throw new Error("expected created");
    expect(res.repaired).toBe(true);
    expect(res.account.financeInfo?.balance).toBe(10_000);

    // And a subsequent attempt correctly reports 'exists'.
    expect((await provisionDemoAccount(broker, env, input)).kind).toBe("exists");
  });

  /** Broker build whose parser rejects bodies carrying `initialDeposit`. */
  class StrictParserBroker extends MockBrokerClient {
    createAttempts = 0;
    async createTradingAccount(
      userUuid: string,
      req: CreateTradingAccountRequest,
    ): Promise<TradingAccount> {
      this.createAttempts++;
      if (req.initialDeposit != null) {
        throw new BrokerApiError({
          status: 400,
          title: "Bad request",
          detail: "Failed to parse json.",
          path: "/v1/user-accounts/x/trading-accounts",
        });
      }
      return super.createTradingAccount(userUuid, req);
    }
  }

  it("falls back to a lean body + separate deposit when the broker rejects initialDeposit", async () => {
    const strict = new StrictParserBroker();
    const res = await provisionDemoAccount(strict, env, input);
    if (res.kind !== "created") throw new Error("expected created");
    expect(strict.createAttempts).toBe(2);
    // funded via the separate deposit call
    expect(res.account.financeInfo?.balance).toBe(10_000);
  });

  it("propagates non-400 create failures instead of retrying", async () => {
    class Broken extends MockBrokerClient {
      async createTradingAccount(): Promise<TradingAccount> {
        throw new BrokerApiError({ status: 500, detail: "boom" });
      }
    }
    await expect(provisionDemoAccount(new Broken(), env, input)).rejects.toMatchObject({
      status: 500,
    });
  });
});
