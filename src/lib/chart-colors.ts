/**
 * Categorical series colors for multi-outcome overlay charts.
 *
 * The order is a validated categorical palette (adjacent-pair CVD ΔE ≥ 8,
 * normal-vision ΔE ≥ 15 on a white surface — checked with the palette
 * validator, not by eye). Hues are assigned in this fixed order, never cycled;
 * charts cap at SERIES_COLORS.length series. Three slots sit below 3:1
 * contrast on white, so any chart using them must keep visible series labels
 * (legend chips + tooltip) — which ours do.
 */
export const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#4a3aa7", // violet
] as const;

/** Single-series (binary market) line — matches the YES/positive accent. */
export const SINGLE_SERIES_COLOR = "#059669";

export const MAX_CHART_SERIES = SERIES_COLORS.length;

/**
 * Stable color assignment: color follows the outcome (keyed by externalId),
 * not its current price rank — so lines don't swap colors when polling
 * re-sorts outcomes. Keys are assigned in alphabetical order, which is
 * deterministic across requests, pages, and re-renders.
 */
export function assignSeriesColors(keys: string[]): Map<string, string> {
  const sorted = [...new Set(keys)].sort();
  const out = new Map<string, string>();
  sorted.forEach((key, i) => {
    out.set(key, SERIES_COLORS[i % SERIES_COLORS.length]);
  });
  return out;
}
