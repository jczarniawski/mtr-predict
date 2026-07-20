import { beforeEach, describe, expect, it } from "vitest";
import { MockBrokerClient, resetMockStore } from "@/lib/broker/mock";
import { BrokerApiError } from "@/lib/broker/errors";
import { round2 } from "@/lib/money";

let broker: MockBrokerClient;

beforeEach(() => {
  resetMockStore();
  broker = new MockBrokerClient();
});

async function createFundedAccount(deposit = 10_000) {
  const user = await broker.createUserAccount("trader@example.com", "Abcd1234");
  const account = await broker.createTradingAccount(user.uuid, {
    group: "predUSD",
    leverageRatioPercent: 100,
    accountType: "DEMO",
    initialDeposit: deposit,
    accountDetails: { firstName: "Test", lastName: "Trader" },
  });
  return account;
}

describe("prediction market data", () => {
  it("lists bets with the documented envelope", async () => {
    const page = await broker.getBets({ page: 0, size: 5 });
    expect(page.items.length).toBe(5);
    expect(page.total).toBeGreaterThan(10);
    expect(page.page).toBe(0);
    const bet = page.items[0];
    expect(bet).toHaveProperty("uuid");
    expect(bet).toHaveProperty("category");
    expect(bet).toHaveProperty("status");
  });

  it("filters by status", async () => {
    const resolved = await broker.getBets({ status: "RESOLVED" });
    expect(resolved.items.length).toBeGreaterThan(0);
    expect(resolved.items.every((b) => b.status === "RESOLVED")).toBe(true);
  });

  it("returns outcomes with YES/NO instrument names", async () => {
    const { items } = await broker.getBets({ status: "ACTIVE" });
    const outcomes = await broker.getBetOutcomes(items[0].uuid);
    expect(outcomes.length).toBeGreaterThan(0);
    for (const o of outcomes) {
      expect(o.instrumentYesName.endsWith("-YES")).toBe(true);
      expect(o.instrumentNoName.endsWith("-NO")).toBe(true);
      expect(o.result).toBeNull();
    }
  });

  it("404s on unknown bets", async () => {
    await expect(broker.getBet("nope")).rejects.toMatchObject({ status: 404 });
  });
});

describe("quotes and candles", () => {
  it("quotes YES/NO pairs consistently in 0..1", async () => {
    const { items } = await broker.getBets({ status: "ACTIVE" });
    const outcomes = await broker.getBetOutcomes(items[0].uuid);
    const o = outcomes[0];
    const quotes = await broker.getQuotes([o.instrumentYesName, o.instrumentNoName]);
    expect(quotes).toHaveLength(2);
    const yes = quotes.find((q) => q.symbol === o.instrumentYesName)!;
    const no = quotes.find((q) => q.symbol === o.instrumentNoName)!;
    for (const q of [yes, no]) {
      expect(q.bid).toBeGreaterThanOrEqual(0);
      expect(q.ask).toBeLessThanOrEqual(1);
      expect(q.ask).toBeGreaterThan(q.bid);
    }
    // YES mid + NO mid ≈ 1
    const yesMid = (yes.bid + yes.ask) / 2;
    const noMid = (no.bid + no.ask) / 2;
    expect(yesMid + noMid).toBeCloseTo(1, 5);
  });

  it("produces chronologically ordered candles ending near the live price", async () => {
    const res = await broker.getCandles({ symbol: "FED-26SEP-CUT-YES", interval: "H1", size: 100 });
    expect(res.candles.length).toBeGreaterThan(10);
    const times = res.candles.map((c) => Date.parse(c.time));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const c of res.candles) {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
    }
    const [quote] = await broker.getQuotes(["FED-26SEP-CUT-YES"]);
    const lastClose = res.candles[res.candles.length - 1].close;
    expect(Math.abs(lastClose - (quote.bid + quote.ask) / 2)).toBeLessThan(0.05);
  });
});

describe("accounts", () => {
  it("creates user + trading account with initial deposit", async () => {
    const account = await createFundedAccount();
    expect(account.login).toMatch(/^\d+$/);
    expect(account.financeInfo?.balance).toBe(10_000);
    expect(account.financeInfo?.equity).toBe(10_000);
  });

  it("rejects duplicate emails with the documented 409 type", async () => {
    await broker.createUserAccount("dup@example.com", "Abcd1234");
    try {
      await broker.createUserAccount("dup@example.com", "Abcd1234");
      expect.unreachable();
    } catch (e) {
      const err = e as BrokerApiError;
      expect(err.status).toBe(409);
      expect(err.errorType).toBe("error://broker-api/user-account/already-exists");
    }
  });

  it("deposits add to balance", async () => {
    const account = await createFundedAccount(100);
    await broker.deposit(account.login, 400);
    const after = await broker.getTradingAccount(account.login);
    expect(after.financeInfo?.balance).toBe(500);
  });
});

describe("trading", () => {
  it("opens a BUY at the ask, reserves margin, and lists the position", async () => {
    const account = await createFundedAccount();
    const [quote] = await broker.getQuotes(["FED-26SEP-CUT-YES"]);
    const ack = await broker.openPosition({
      login: account.login,
      symbol: "FED-26SEP-CUT-YES",
      orderSide: "BUY",
      volume: 100,
    });
    expect(ack.status).toBe("OK");

    const [acct] = await broker.getOpenPositions(account.login);
    expect(acct.positions).toHaveLength(1);
    const pos = acct.positions[0];
    expect(pos.side).toBe("BUY");
    expect(pos.volume).toBe(100);
    expect(pos.openPrice).toBeCloseTo(quote.ask, 2);

    const after = await broker.getTradingAccount(account.login);
    expect(after.financeInfo?.margin).toBeCloseTo(round2(100 * pos.openPrice), 2);
    expect(after.financeInfo?.balance).toBe(10_000); // balance only moves on close
  });

  it("rejects orders beyond free margin", async () => {
    const account = await createFundedAccount(10);
    await expect(
      broker.openPosition({
        login: account.login,
        symbol: "FED-26SEP-CUT-YES",
        orderSide: "BUY",
        volume: 1000,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects trading on resolved markets", async () => {
    const account = await createFundedAccount();
    await expect(
      broker.openPosition({
        login: account.login,
        symbol: "ESC26-SWE-YES",
        orderSide: "BUY",
        volume: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("close realizes P&L into the balance and records history", async () => {
    const account = await createFundedAccount();
    await broker.openPosition({
      login: account.login,
      symbol: "BTC-150K-26-YES",
      orderSide: "BUY",
      volume: 50,
    });
    const [acct] = await broker.getOpenPositions(account.login);
    const positionId = acct.positions[0].id;

    const res = await broker.closePositions(account.login, [{ positionId }]);
    expect(res.partialResponses?.every((p) => !p.errorMessage)).toBe(true);

    const [after] = await broker.getOpenPositions(account.login);
    expect(after.positions).toHaveLength(0);

    const closed = await broker.getClosedPositions(
      account.login,
      new Date(Date.now() - 3600_000).toISOString(),
      new Date().toISOString(),
    );
    expect(closed).toHaveLength(1);
    const fin = (await broker.getTradingAccount(account.login)).financeInfo!;
    expect(fin.balance).toBeCloseTo(round2(10_000 + closed[0].profit), 2);
    expect(fin.margin).toBe(0);
  });

  it("reports per-item failures via partialResponses on a 200", async () => {
    const account = await createFundedAccount();
    const res = await broker.closePositions(account.login, [{ positionId: "does-not-exist" }]);
    expect(res.partialResponses?.[0].errorMessage).toBeTruthy();
  });

  it("partially closes and keeps the remainder open", async () => {
    const account = await createFundedAccount();
    await broker.openPosition({
      login: account.login,
      symbol: "CPI-DEC26-3-YES",
      orderSide: "BUY",
      volume: 40,
    });
    const [acct] = await broker.getOpenPositions(account.login);
    await broker.closePartially({
      login: account.login,
      positionId: acct.positions[0].id,
      volume: 15,
    });
    const [after] = await broker.getOpenPositions(account.login);
    expect(after.positions[0].volume).toBe(25);
    const closed = await broker.getClosedPositions(
      account.login,
      new Date(Date.now() - 3600_000).toISOString(),
      new Date().toISOString(),
    );
    expect(closed[0].volume).toBe(15);
  });
});
