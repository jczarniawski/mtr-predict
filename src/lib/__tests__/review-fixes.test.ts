import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockBrokerClient, resetMockStore } from "@/lib/broker/mock";
import { MarketService } from "@/lib/markets";
import { QuoteService } from "@/lib/quotes";

let broker: MockBrokerClient;

beforeEach(() => {
  resetMockStore();
  broker = new MockBrokerClient();
});

describe("mock candles: NO side is the mirror of YES (regression)", () => {
  it("keeps NO candles in [0,1] and equal to 1 − YES per bucket, with OHLC invariants", async () => {
    const yesSym = "FED-26SEP-CUT-YES";
    const noSym = "FED-26SEP-CUT-NO";
    const [yes, no] = await Promise.all([
      broker.getCandles({ symbol: yesSym, interval: "M5", size: 200 }),
      broker.getCandles({ symbol: noSym, interval: "M5", size: 200 }),
    ]);

    expect(no.candles.length).toBe(yes.candles.length);
    expect(no.candles.length).toBeGreaterThan(10);

    for (let i = 0; i < no.candles.length; i++) {
      const y = yes.candles[i];
      const n = no.candles[i];
      // same bucket
      expect(n.time).toBe(y.time);
      // NO === 1 − YES on every OHLC field (tolerant of 4dp rounding)
      expect(n.open + y.open).toBeCloseTo(1, 3);
      expect(n.close + y.close).toBeCloseTo(1, 3);
      // in range
      for (const v of [n.open, n.high, n.low, n.close]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      // OHLC invariants hold on the NO series (the bug produced high<open etc.)
      expect(n.high).toBeGreaterThanOrEqual(Math.max(n.open, n.close) - 1e-9);
      expect(n.low).toBeLessThanOrEqual(Math.min(n.open, n.close) + 1e-9);
    }

    // Continuity: no spurious jump — each bucket opens at the previous close.
    for (let i = 1; i < no.candles.length; i++) {
      expect(no.candles[i].open).toBeCloseTo(no.candles[i - 1].close, 3);
    }
  });
});

describe("MarketService.resolveSymbols: bounded + caches unresolved (regression)", () => {
  function makeMarkets() {
    return new MarketService(broker, new QuoteService(broker, "", ""), "predUSD");
  }

  it("does not re-sweep the bet universe for a symbol that stays unresolvable", async () => {
    const markets = makeMarkets();
    const spy = vi.spyOn(broker, "getBetOutcomes");

    const first = await markets.resolveSymbols(["TOTALLY-UNKNOWN-YES"]);
    expect(first.has("TOTALLY-UNKNOWN-YES")).toBe(false);
    const sweep1 = spy.mock.calls.length;
    expect(sweep1).toBeGreaterThan(0); // it did scan bets once

    // Second lookup of the same unresolvable symbol must hit the unresolved
    // cache and issue no further outcome fetches.
    await markets.resolveSymbols(["TOTALLY-UNKNOWN-YES"]);
    expect(spy.mock.calls.length).toBe(sweep1);
  });

  it("still resolves a real instrument to its bet/outcome/side", async () => {
    const markets = makeMarkets();
    const refs = await markets.resolveSymbols(["BTC-150K-26-YES", "WC26-ESP-NO"]);
    expect(refs.get("BTC-150K-26-YES")?.side).toBe("YES");
    expect(refs.get("WC26-ESP-NO")?.side).toBe("NO");
    expect(refs.get("WC26-ESP-NO")?.outcomeTitle).toBe("Spain");
  });
});
