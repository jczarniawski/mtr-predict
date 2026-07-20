import { beforeEach, describe, expect, it } from "vitest";
import { MockBrokerClient, resetMockStore } from "@/lib/broker/mock";
import { MarketService } from "@/lib/markets";
import { QuoteService } from "@/lib/quotes";

let markets: MarketService;
let broker: MockBrokerClient;

beforeEach(() => {
  resetMockStore();
  broker = new MockBrokerClient();
  markets = new MarketService(broker, new QuoteService(broker, "", ""), "predUSD");
});

describe("MarketService.listMarkets", () => {
  it("assembles active markets with priced outcomes", async () => {
    const list = await markets.listMarkets({});
    expect(list.length).toBeGreaterThan(5);
    for (const m of list) {
      expect(m.status).toBe("ACTIVE");
      expect(m.outcomes.length).toBeGreaterThan(0);
      const top = m.outcomes[0];
      expect(top.yesMid).toBeGreaterThan(0);
      expect(top.yesMid).toBeLessThan(1);
      expect(top.yes?.ask).toBeGreaterThan(top.yes?.bid ?? 0);
    }
  });

  it("sorts multi-choice outcomes by probability, most likely first", async () => {
    const list = await markets.listMarkets({});
    const multi = list.find((m) => m.outcomesTotal > 2)!;
    const mids = multi.outcomes.map((o) => o.yesMid ?? 0);
    expect([...mids].sort((a, b) => b - a)).toEqual(mids);
  });

  it("provides a NO price even when only YES was quoted (derived as 1 − yes)", async () => {
    const list = await markets.listMarkets({});
    const multi = list.find((m) => m.outcomesTotal > 2)!;
    for (const o of multi.outcomes) {
      expect(o.no).not.toBeNull();
      expect((o.yes!.mid + o.no!.mid) * 100).toBeCloseTo(100, 3);
    }
  });

  it("filters by category and search text", async () => {
    const categories = await markets.listCategories();
    expect(categories.length).toBeGreaterThan(2);
    const cat = categories[0];
    const filtered = await markets.listMarkets({ category: cat });
    expect(filtered.every((m) => m.category === cat)).toBe(true);

    const searched = await markets.listMarkets({ q: "bitcoin" });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((m) => m.title.toLowerCase().includes("bitcoin"))).toBe(true);
  });

  it("lists resolved markets with settlement results", async () => {
    const resolved = await markets.listMarkets({ status: "RESOLVED" });
    expect(resolved.length).toBeGreaterThan(0);
    const winners = resolved[0].outcomes.filter((o) => o.result === true);
    expect(winners).toHaveLength(1);
    expect(winners[0].yesMid).toBe(1);
  });
});

describe("MarketService.getMarket", () => {
  it("returns detail fields with both-side prices", async () => {
    const [bet] = (await broker.getBets({ status: "ACTIVE" })).items;
    const market = await markets.getMarket(bet.uuid);
    expect(market.subtitle).toBeTruthy();
    expect(market.closeDate).toBeTruthy();
    for (const o of market.outcomes) {
      expect(o.yes).not.toBeNull();
      expect(o.no).not.toBeNull();
    }
  });
});

describe("MarketService.resolveSymbols", () => {
  it("maps instrument symbols back to bet/outcome/side without prior warm-up", async () => {
    const refs = await markets.resolveSymbols(["BTC-150K-26-YES", "WC26-ESP-NO", "ESC26-SWE-YES"]);
    expect(refs.get("BTC-150K-26-YES")?.side).toBe("YES");
    expect(refs.get("BTC-150K-26-YES")?.betTitle).toMatch(/Bitcoin/);
    expect(refs.get("WC26-ESP-NO")?.side).toBe("NO");
    expect(refs.get("WC26-ESP-NO")?.outcomeTitle).toBe("Spain");
    expect(refs.get("ESC26-SWE-YES")?.betStatus).toBe("RESOLVED");
    expect(refs.get("unknown-symbol")).toBeUndefined();
  });
});

describe("MarketService.getSymbolInfos", () => {
  it("returns PRED contract config for instruments", async () => {
    const infos = await markets.getSymbolInfos(["BTC-150K-26-YES"]);
    const info = infos.get("BTC-150K-26-YES")!;
    expect(info.contractSize).toBe(1);
    expect(info.volumeMin).toBeGreaterThan(0);
    expect(info.type).toBe("PRED");
  });
});
