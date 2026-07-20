import { describe, expect, it } from "vitest";
import {
  clampVolume,
  formatCents,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  positionCost,
  positionPayout,
  potentialProfit,
} from "@/lib/money";

describe("formatCents", () => {
  it("renders whole cents", () => {
    expect(formatCents(0.35)).toBe("35¢");
    expect(formatCents(0.05)).toBe("5¢");
    expect(formatCents(1)).toBe("100¢");
    expect(formatCents(0)).toBe("0¢");
  });

  it("keeps a single decimal for sub-cent prices", () => {
    expect(formatCents(0.355)).toBe("35.5¢");
    expect(formatCents(0.0525)).toBe("5.3¢");
  });

  it("handles missing values", () => {
    expect(formatCents(null)).toBe("–");
    expect(formatCents(undefined)).toBe("–");
    expect(formatCents(Number.NaN)).toBe("–");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent", () => {
    expect(formatPercent(0.62)).toBe("62%");
    expect(formatPercent(0.615)).toBe("62%");
  });

  it("never shows 0% or 100% for strictly interior prices", () => {
    expect(formatPercent(0.002)).toBe("1%");
    expect(formatPercent(0.999)).toBe("99%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("formatMoney", () => {
  it("formats USD", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatSignedMoney(12.3)).toBe("+$12.30");
    expect(formatSignedMoney(-4)).toBe("-$4.00");
  });
});

describe("clampVolume", () => {
  const info = { volumeMin: 1, volumeMax: 100, volumeStep: 1 };

  it("passes valid volumes through", () => {
    expect(clampVolume(10, info)).toBe(10);
  });

  it("snaps down to the step", () => {
    expect(clampVolume(10.9, info)).toBe(10);
  });

  it("clamps to max and rejects below min", () => {
    expect(clampVolume(1000, info)).toBe(100);
    expect(clampVolume(0.5, info)).toBe(0);
    expect(clampVolume(-3, info)).toBe(0);
    expect(clampVolume(Number.NaN, info)).toBe(0);
  });

  it("handles fractional steps without float drift", () => {
    const fx = { volumeMin: 0.01, volumeMax: 100, volumeStep: 0.01 };
    expect(clampVolume(0.3, fx)).toBe(0.3);
    expect(clampVolume(0.305, fx)).toBe(0.3);
    expect(clampVolume(0.1 + 0.2, fx)).toBe(0.3);
  });

  it("uses defaults when no symbol info is available", () => {
    expect(clampVolume(5.7)).toBe(5);
  });
});

describe("PRED position math", () => {
  it("matches the worked example from the API docs (100 @ 0.35)", () => {
    expect(positionCost(100, 0.35)).toBe(35);
    expect(positionPayout(100)).toBe(100);
    expect(potentialProfit(100, 0.35)).toBe(65);
  });

  it("respects contract size", () => {
    expect(positionCost(2, 0.5, 10)).toBe(10);
    expect(positionPayout(2, 10)).toBe(20);
  });
});
