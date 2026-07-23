"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePolledJson } from "@/components/fetcher";
import { formatPercent } from "@/lib/money";
import type { Candle } from "@/lib/broker/types";

const RANGES = ["1d", "1w", "1m", "all"] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABELS: Record<Range, string> = { "1d": "1D", "1w": "1W", "1m": "1M", all: "ALL" };

interface CandlesResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
}

const H = 240;
const PAD_X = 8;
const PAD_Y = 14;

/**
 * Kalshi-style probability chart for one PRED instrument (the YES side).
 * Candle closes + the live mid as the freshest point.
 */
export function PriceChart({
  symbol,
  livePrice,
  title,
}: {
  symbol: string;
  livePrice: number | null;
  title?: string;
}) {
  const [range, setRange] = useState<Range>("1w");
  const { data, loading } = usePolledJson<CandlesResponse>(
    `/api/candles?symbol=${encodeURIComponent(symbol)}&range=${range}`,
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

  const points = useMemo(() => {
    const candles = data?.candles ?? [];
    const pts = candles.map((c) => ({ ts: Date.parse(c.time), value: c.close }));
    if (livePrice != null) {
      const lastTs = pts[pts.length - 1]?.ts ?? 0;
      pts.push({ ts: Math.max(Date.now(), lastTs + 1), value: livePrice });
    }
    return pts.filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value));
  }, [data, livePrice]);

  const [hover, setHover] = useState<number | null>(null);

  const { path, area, xy, lo, hi } = useMemo(() => {
    if (points.length < 2) {
      return { path: "", area: "", xy: [] as { x: number; y: number }[], lo: 0, hi: 1 };
    }
    const values = points.map((p) => p.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const span = Math.max(hi - lo, 0.08);
    const mid = (hi + lo) / 2;
    lo = Math.max(0, mid - span * 0.65);
    hi = Math.min(1, mid + span * 0.65);
    if (hi - lo < 0.08) {
      if (lo === 0) hi = 0.08;
      else if (hi === 1) lo = 0.92;
    }
    const innerW = width - PAD_X * 2;
    const innerH = H - PAD_Y * 2;
    const xy = points.map((p, i) => ({
      x: PAD_X + (i / (points.length - 1)) * innerW,
      y: PAD_Y + (1 - (p.value - lo) / (hi - lo)) * innerH,
    }));
    const path = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${path} L${xy[xy.length - 1].x.toFixed(1)},${H - PAD_Y} L${xy[0].x.toFixed(1)},${H - PAD_Y} Z`;
    return { path, area, xy, lo, hi };
  }, [points, width]);

  const hoverPoint = hover != null && xy[hover] ? { ...xy[hover], ...points[hover] } : null;
  const shown = hoverPoint?.value ?? livePrice ?? points[points.length - 1]?.value ?? null;
  const first = points[0]?.value ?? null;
  const delta = shown != null && first != null ? shown - first : null;

  const gridLines = [0.25, 0.5, 0.75].map((f) => ({
    y: PAD_Y + (1 - f) * (H - PAD_Y * 2),
    label: formatPercent(lo + f * (hi - lo)),
  }));

  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          {title && <div className="text-xs font-medium text-slate-400">{title}</div>}
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tabular-nums">
              {shown != null ? formatPercent(shown) : "–"}
            </span>
            <span className="text-sm font-medium text-slate-400">chance</span>
            {delta != null && Math.abs(delta) >= 0.005 && (
              <span
                className={`text-sm font-bold ${delta > 0 ? "text-yes-strong" : "text-no-strong"}`}
              >
                {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}pp
              </span>
            )}
            {hoverPoint && (
              <span className="text-xs text-slate-400">
                {new Date(hoverPoint.ts).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: range === "1d" ? "numeric" : undefined,
                  minute: range === "1d" ? "2-digit" : undefined,
                })}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
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
      </div>

      <div
        ref={containerRef}
        className="relative select-none"
        style={{ height: H }}
        onMouseMove={(e) => {
          if (!xy.length) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const frac = Math.min(1, Math.max(0, (x - PAD_X) / Math.max(1, width - PAD_X * 2)));
          setHover(Math.round(frac * (xy.length - 1)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {loading && !data ? (
          <div className="h-full w-full animate-pulse rounded-lg bg-canvas" />
        ) : points.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No price history yet
          </div>
        ) : (
          <svg width={width} height={H} className="block">
            <defs>
              <linearGradient id={`fill-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {gridLines.map((g, i) => (
              <g key={i}>
                <line x1={PAD_X} x2={width - PAD_X} y1={g.y} y2={g.y} stroke="#eef1f6" />
                <text x={width - PAD_X - 2} y={g.y - 4} textAnchor="end" fontSize="10" fill="#a7b0bf">
                  {g.label}
                </text>
              </g>
            ))}
            <path d={area} fill={`url(#fill-${symbol})`} />
            <path d={path} fill="none" stroke="#059669" strokeWidth="2" strokeLinejoin="round" />
            {hoverPoint && (
              <>
                <line
                  x1={hoverPoint.x}
                  x2={hoverPoint.x}
                  y1={PAD_Y}
                  y2={H - PAD_Y}
                  stroke="#cbd5e1"
                  strokeDasharray="3 3"
                />
                <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4" fill="#059669" stroke="#fff" strokeWidth="2" />
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
