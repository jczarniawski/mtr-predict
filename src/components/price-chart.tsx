"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePolledJson } from "@/components/fetcher";
import { formatPercent } from "@/lib/money";
import type { Candle } from "@/lib/broker/types";

const RANGES = ["1d", "1w", "1m", "all"] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABELS: Record<Range, string> = { "1d": "1D", "1w": "1W", "1m": "1M", all: "ALL" };

export interface ChartSeries {
  /** Instrument to chart (an outcome's YES symbol). */
  symbol: string;
  /** Display name — outcome title. */
  label: string;
  color: string;
  /** Live mid appended as the freshest point. */
  live?: number | null;
}

interface CandlesResponse {
  range: string;
  interval: string;
  series: { symbol: string; candles: Candle[] }[];
}

interface Point {
  ts: number;
  value: number;
}

const PAD_X = 8;
const PAD_Y = 16;

function fmtTick(ts: number, range: Range): string {
  const d = new Date(ts);
  if (range === "1d")
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (range === "all")
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Probability chart for one or more outcomes (YES side, 0..1).
 * Single series renders as a line with a soft area fill; multiple series render
 * as overlaid 2px lines with a persistent legend (color dot + label + latest %)
 * and a crosshair tooltip listing every series.
 */
export function PriceChart({
  series,
  title,
  compact = false,
  selectedSymbol,
  onSelect,
}: {
  series: ChartSeries[];
  title?: string;
  compact?: boolean;
  selectedSymbol?: string;
  onSelect?: (symbol: string) => void;
}) {
  const [range, setRange] = useState<Range>("1w");
  const height = compact ? 190 : 240;
  const symbolsKey = series.map((s) => s.symbol).join(",");
  const { data, loading } = usePolledJson<CandlesResponse>(
    symbolsKey ? `/api/candles?symbols=${encodeURIComponent(symbolsKey)}&range=${range}` : null,
    60_000,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Per-series point lists (candle closes + the live mid as freshest point).
  const lines = useMemo(() => {
    const bySymbol = new Map((data?.series ?? []).map((s) => [s.symbol, s.candles]));
    return series.map((s) => {
      const pts: Point[] = (bySymbol.get(s.symbol) ?? [])
        .map((c) => ({ ts: Date.parse(c.time), value: c.close }))
        .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value));
      if (s.live != null) {
        const lastTs = pts[pts.length - 1]?.ts ?? 0;
        pts.push({ ts: Math.max(Date.now(), lastTs + 1), value: s.live });
      }
      return { ...s, points: pts };
    });
  }, [data, series]);

  const [hoverX, setHoverX] = useState<number | null>(null);

  const geom = useMemo(() => {
    const drawable = lines.filter((l) => l.points.length >= 2);
    if (drawable.length === 0) return null;

    let tMin = Infinity;
    let tMax = -Infinity;
    let lo = Infinity;
    let hi = -Infinity;
    for (const l of drawable) {
      for (const p of l.points) {
        if (p.ts < tMin) tMin = p.ts;
        if (p.ts > tMax) tMax = p.ts;
        if (p.value < lo) lo = p.value;
        if (p.value > hi) hi = p.value;
      }
    }
    if (tMax <= tMin) return null;
    const span = Math.max(hi - lo, 0.08);
    const midV = (hi + lo) / 2;
    lo = Math.max(0, midV - span * 0.65);
    hi = Math.min(1, midV + span * 0.65);
    if (hi - lo < 0.08) {
      if (lo === 0) hi = 0.08;
      else if (hi === 1) lo = 0.92;
    }

    const innerW = width - PAD_X * 2;
    const innerH = height - PAD_Y * 2;
    const x = (ts: number) => PAD_X + ((ts - tMin) / (tMax - tMin)) * innerW;
    const y = (v: number) => PAD_Y + (1 - (v - lo) / (hi - lo)) * innerH;

    const paths = drawable.map((l) => ({
      ...l,
      d: l.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`)
        .join(" "),
      area:
        drawable.length === 1
          ? `${l.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.ts).toFixed(1)},${y(p.value).toFixed(1)}`)
              .join(" ")} L${x(l.points[l.points.length - 1].ts).toFixed(1)},${height - PAD_Y} L${x(
              l.points[0].ts,
            ).toFixed(1)},${height - PAD_Y} Z`
          : null,
    }));

    return { paths, tMin, tMax, lo, hi, x, y };
  }, [lines, width, height]);

  // Hover: nearest timestamp under the cursor, one row per series.
  const hover = useMemo(() => {
    if (hoverX == null || !geom) return null;
    const t =
      geom.tMin +
      Math.min(1, Math.max(0, (hoverX - PAD_X) / Math.max(1, width - PAD_X * 2))) *
        (geom.tMax - geom.tMin);
    const rows = geom.paths.map((l) => {
      let best = l.points[0];
      for (const p of l.points) {
        if (Math.abs(p.ts - t) < Math.abs(best.ts - t)) best = p;
      }
      return { symbol: l.symbol, label: l.label, color: l.color, point: best };
    });
    const ts = rows[0]?.point.ts ?? t;
    return { xPx: geom.x(ts), ts, rows };
  }, [hoverX, geom, width]);

  const multi = series.length > 1;
  const single = geom && geom.paths.length === 1 ? geom.paths[0] : null;
  const shownValue =
    !multi && single
      ? (hover?.rows[0]?.point.value ?? single.points[single.points.length - 1]?.value ?? null)
      : null;
  const firstValue = !multi && single ? (single.points[0]?.value ?? null) : null;
  const delta = shownValue != null && firstValue != null ? shownValue - firstValue : null;

  const gridLines = geom
    ? [0.25, 0.5, 0.75].map((f) => ({
        y: PAD_Y + (1 - f) * (height - PAD_Y * 2),
        label: formatPercent(geom.lo + f * (geom.hi - geom.lo)),
      }))
    : [];

  const xTicks = geom
    ? [0.02, 0.5, 0.98].map((f) => ({
        x: PAD_X + f * (width - PAD_X * 2),
        label: fmtTick(geom.tMin + f * (geom.tMax - geom.tMin), range),
        anchor: (f < 0.1 ? "start" : f > 0.9 ? "end" : "middle") as "start" | "middle" | "end",
      }))
    : [];

  const gradId = `pcfill-${series[0]?.symbol ?? "x"}`;

  return (
    <div
      className={compact ? "" : "rounded-2xl border border-line bg-white p-4 shadow-card"}
      data-testid="price-chart"
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        {!multi ? (
          <div>
            {title && <div className="text-xs font-medium text-slate-400">{title}</div>}
            <div className="flex items-baseline gap-2">
              <span className={`font-extrabold tabular-nums ${compact ? "text-2xl" : "text-3xl"}`}>
                {shownValue != null ? formatPercent(shownValue) : "–"}
              </span>
              <span className="text-sm font-medium text-slate-400">chance</span>
              {delta != null && Math.abs(delta) >= 0.005 && (
                <span
                  className={`text-sm font-bold ${delta > 0 ? "text-yes-strong" : "text-no-strong"}`}
                >
                  {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}pp
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            {title && <div className="mb-1 text-xs font-medium text-slate-400">{title}</div>}
            {/* Persistent legend: identity is never color-alone. */}
            <div className="flex flex-wrap gap-x-3 gap-y-1" data-testid="chart-legend">
              {lines.map((l) => {
                const latest = l.live ?? l.points[l.points.length - 1]?.value ?? null;
                const active = !selectedSymbol || selectedSymbol === l.symbol;
                return (
                  <button
                    key={l.symbol}
                    onClick={onSelect ? () => onSelect(l.symbol) : undefined}
                    className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-semibold transition ${
                      active ? "text-ink" : "text-slate-400"
                    } ${onSelect ? "hover:bg-canvas" : "cursor-default"}`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: l.color }}
                      aria-hidden
                    />
                    <span className="max-w-[10rem] truncate">{l.label}</span>
                    <span className="tabular-nums text-slate-500">{formatPercent(latest)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!compact && (
          <div className="flex shrink-0 gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                  range === r ? "bg-ink text-white" : "text-slate-500 hover:bg-canvas"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative select-none"
        style={{ height }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverX(e.clientX - rect.left);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {loading && !data ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-canvas" />
        ) : !geom ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No price history yet
          </div>
        ) : (
          <>
            <svg width={width} height={height} className="block">
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={series[0]?.color} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={series[0]?.color} stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {gridLines.map((g, i) => (
                <g key={i}>
                  <line x1={PAD_X} x2={width - PAD_X} y1={g.y} y2={g.y} stroke="#eef1f6" />
                  <text
                    x={width - PAD_X - 2}
                    y={g.y - 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#a7b0bf"
                  >
                    {g.label}
                  </text>
                </g>
              ))}
              {xTicks.map((t, i) => (
                <text key={i} x={t.x} y={height - 2} textAnchor={t.anchor} fontSize="10" fill="#a7b0bf">
                  {t.label}
                </text>
              ))}
              {single?.area && <path d={single.area} fill={`url(#${gradId})`} />}
              {geom.paths.map((l) => {
                const dim = multi && selectedSymbol && selectedSymbol !== l.symbol;
                return (
                  <path
                    key={l.symbol}
                    d={l.d}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={selectedSymbol === l.symbol ? 2.5 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={dim ? 0.45 : 1}
                  />
                );
              })}
              {hover && (
                <>
                  <line
                    x1={hover.xPx}
                    x2={hover.xPx}
                    y1={PAD_Y}
                    y2={height - PAD_Y}
                    stroke="#cbd5e1"
                    strokeDasharray="3 3"
                  />
                  {hover.rows.map((r) => (
                    <circle
                      key={r.symbol}
                      cx={geom.x(r.point.ts)}
                      cy={geom.y(r.point.value)}
                      r="4"
                      fill={r.color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  ))}
                </>
              )}
            </svg>
            {hover && (
              <div
                className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-white/95 px-2.5 py-1.5 shadow-pop backdrop-blur"
                style={{
                  left: Math.min(Math.max(hover.xPx + 10, 4), Math.max(4, width - 175)),
                }}
              >
                <div className="mb-0.5 text-[10px] font-medium text-slate-400">
                  {new Date(hover.ts).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: range === "1d" ? "numeric" : undefined,
                    minute: range === "1d" ? "2-digit" : undefined,
                  })}
                </div>
                {hover.rows.map((r) => (
                  <div key={r.symbol} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: r.color }}
                      aria-hidden
                    />
                    <span className="max-w-[7.5rem] truncate font-medium">{r.label}</span>
                    <span className="ml-auto pl-2 font-bold tabular-nums">
                      {formatPercent(r.point.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
