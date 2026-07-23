import type { SymbolInfo } from "@/lib/broker/types";

/**
 * PRED instruments price in 0..1 (implied probability) and a winning side
 * settles at 1.0. All money math is plain volume × price × contractSize —
 * these helpers keep the rounding consistent across the app.
 */

/** 0..1 price → cents number (0..100), at most 1 decimal place. */
export function priceToCents(price: number): number {
  return Math.round(price * 1000) / 10;
}

/** Kalshi-style cents label: 0.35 → "35¢", 0.355 → "35.5¢". */
export function formatCents(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "–";
  const cents = priceToCents(price);
  const label = Number.isInteger(cents) ? cents.toFixed(0) : cents.toFixed(1);
  return `${label}¢`;
}

/** 0..1 price → "35%" (rounded to whole percent, clamped to 1..99 when strictly inside). */
export function formatPercent(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price)) return "–";
  let pct = Math.round(price * 100);
  if (price > 0 && pct === 0) pct = 1;
  if (price < 1 && pct === 100) pct = 99;
  return `${pct}%`;
}

export function formatMoney(
  value: number | null | undefined,
  currency = "USD",
  precision = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return formatter.format(value);
}

/** Signed variant: +$12.30 / -$4.00. */
export function formatSignedMoney(
  value: number | null | undefined,
  currency = "USD",
  precision = 2,
): string {
  if (value == null || !Number.isFinite(value)) return "–";
  const abs = formatMoney(Math.abs(value), currency, precision);
  return value >= 0 ? `+${abs}` : `-${abs}`;
}

const DEFAULT_VOLUME: Pick<SymbolInfo, "volumeMin" | "volumeMax" | "volumeStep"> = {
  volumeMin: 1,
  volumeMax: 100_000,
  volumeStep: 1,
};

/**
 * Snap a requested volume to the instrument's step and clamp into [min, max].
 * Snapping rounds DOWN so a user can never be charged for more than they asked.
 * Returns 0 when the request can't reach the minimum volume.
 */
export function clampVolume(
  requested: number,
  info?: Partial<Pick<SymbolInfo, "volumeMin" | "volumeMax" | "volumeStep">> | null,
): number {
  const { volumeMin, volumeMax, volumeStep } = { ...DEFAULT_VOLUME, ...info };
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  const step = volumeStep > 0 ? volumeStep : 1;
  const stepDecimals = decimalsOf(step);
  let v = Math.floor((requested + 1e-9) / step) * step;
  v = Number(v.toFixed(stepDecimals));
  if (v > volumeMax) v = Number((Math.floor(volumeMax / step) * step).toFixed(stepDecimals));
  if (v < volumeMin) return 0;
  return v;
}

function decimalsOf(step: number): number {
  const s = step.toString();
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  return Math.min(8, s.length - dot - 1);
}

/** Cost of buying `volume` at `price` (contracts × contractSize × price). */
export function positionCost(volume: number, price: number, contractSize = 1): number {
  return round2(volume * contractSize * price);
}

/** Payout if the bought side settles at 1.0. */
export function positionPayout(volume: number, contractSize = 1): number {
  return round2(volume * contractSize);
}

/** Profit if the bought side wins: payout − cost. */
export function potentialProfit(volume: number, price: number, contractSize = 1): number {
  return round2(volume * contractSize * (1 - price));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Mid price from a bid/ask pair. */
export function mid(bid: number, ask: number): number {
  return (bid + ask) / 2;
}

/**
 * Payout multiplier for a winning contract bought at `price` (settles at 1.0):
 * 0.5 → "2x", 0.62 → "1.6x", 0.05 → "20x". Null when price is missing or too
 * close to the bounds to be meaningful.
 */
export function formatMultiplier(price: number | null | undefined): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0.005 || price >= 1) return null;
  const mult = 1 / price;
  const label = mult >= 10 ? Math.round(mult).toString() : (Math.round(mult * 10) / 10).toString();
  return `${label}x`;
}
