import { beforeEach, describe, expect, it } from "vitest";
import { assignSeriesColors, SERIES_COLORS } from "@/lib/chart-colors";
import { formatMultiplier } from "@/lib/money";
import { MockBrokerClient, resetMockStore } from "@/lib/broker/mock";
import { MarketService } from "@/lib/markets";
import { QuoteService } from "@/lib/quotes";

describe("formatMultiplier", () => {
  it("computes the winning payout multiple", () => {
    expect(formatMultiplier(0.5)).toBe("2x");
    expect(formatMultiplier(0.62)).toBe("1.6x");
    expect(formatMultiplier(0.05)).toBe("20x");
  });

  it("returns null for missing or degenerate prices", () => {
    expect(formatMultiplier(null)).toBeNull();
    expect(formatMultiplier(undefined)).toBeNull();
    expect(formatMultiplier(0)).toBeNull();
    expect(formatMultiplier(1)).toBeNull();
    expect(formatMultiplier(Number.NaN)).toBeNull();
  });
});

describe("assignSeriesColors", () => {
  it("assigns colors by entity, independent of input order", () => {
    const a = assignSeriesColors(["WC26-ESP", "WC26-FRA", "WC26-ARG"]);
    const b = assignSeriesColors(["WC26-ARG", "WC26-ESP", "WC26-FRA"]);
    for (const key of ["WC26-ESP", "WC26-FRA", "WC26-ARG"]) {
      expect(a.get(key)).toBe(b.get(key));
    }
  });

  it("uses the fixed palette order without cycling for ≤ palette-size sets", () => {
    const m = assignSeriesColors(["a", "b", "c"]);
    expect(new Set(m.values()).size).toBe(3);
    expect([...m.values()].every((c) => (SERIES_COLORS as readonly string[]).includes(c))).toBe(
      true,
    );
  });
});

describe("MarketService.getHomeView", () => {
  let markets: MarketService;

  beforeEach(() => {
    resetMockStore();
    const broker = new MockBrokerClient();
    markets = new MarketService(broker, new QuoteService(broker, "", ""), "predUSD");
  });

  it("returns featured markets with subtitles, movers, and category shelves", async () => {
    const home = await markets.getHomeView();

    expect(home.featured.length).toBeGreaterThanOrEqual(3);
    expect(home.featured.length).toBeLessThanOrEqual(5);
    for (const f of home.featured) {
      expect(f.status).toBe("ACTIVE");
      expect(f.subtitle).toBeTruthy();
      expect(f.outcomes.length).toBeGreaterThan(0);
    }
    // multi-outcome markets lead the carousel
    expect(home.featured[0].outcomesTotal).toBeGreaterThanOrEqual(3);

    expect(home.movers.length).toBeGreaterThan(0);
    const changes = home.movers.map((m) => Math.abs(m.dailyChange));
    expect([...changes].sort((a, b) => b - a)).toEqual(changes);

    expect(home.sections.length).toBeGreaterThan(2);
    for (const s of home.sections) {
      expect(s.markets.length).toBeGreaterThan(0);
      expect(s.markets.every((m) => m.category === s.category)).toBe(true);
      expect(s.markets.length).toBeLessThanOrEqual(8);
    }
    expect(home.categories.length).toBeGreaterThan(2);
  });
});
