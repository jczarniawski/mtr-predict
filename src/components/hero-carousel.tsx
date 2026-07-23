"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PriceChart } from "@/components/price-chart";
import { Badge, CategoryTile } from "@/components/ui";
import { assignSeriesColors, MAX_CHART_SERIES, SINGLE_SERIES_COLOR } from "@/lib/chart-colors";
import { formatCents, formatMultiplier, formatPercent } from "@/lib/money";
import type { FeaturedMarket } from "@/lib/markets";

const ADVANCE_MS = 9_000;
const HERO_ROWS = 3;

function closesLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Closing soon";
  if (days === 1) return "Closes tomorrow";
  if (days <= 30) return `Closes in ${days} days`;
  return `Closes ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function HeroSlide({ market }: { market: FeaturedMarket }) {
  const router = useRouter();
  const binary = market.outcomesTotal <= 1;
  const colorByKey = assignSeriesColors(market.outcomes.map((o) => o.externalId));
  const chartOutcomes = market.outcomes.slice(0, Math.min(HERO_ROWS, MAX_CHART_SERIES));
  const series = chartOutcomes.map((o) => ({
    symbol: o.instrumentYesName,
    label: o.title,
    color: binary ? SINGLE_SERIES_COLOR : (colorByKey.get(o.externalId) ?? SINGLE_SERIES_COLOR),
    live: o.yesMid,
  }));
  const closes = closesLabel(market.closeDate);

  const goTicket = (externalId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/market/${market.uuid}?outcome=${encodeURIComponent(externalId)}&side=yes`);
  };

  return (
    <div
      onClick={() => router.push(`/market/${market.uuid}`)}
      className="grid cursor-pointer gap-5 rounded-2xl border border-line bg-white p-5 shadow-hero transition hover:shadow-pop md:grid-cols-[1.05fr_1fr] md:p-6"
      data-testid="hero-slide"
    >
      <div className="flex min-w-0 flex-col">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CategoryTile category={market.category} imageUrl={market.imageUrl || undefined} />
          <Badge>{market.category}</Badge>
          {closes && <span className="text-xs font-medium text-slate-400">{closes}</span>}
        </div>
        <h2 className="text-xl font-extrabold leading-snug tracking-tight md:text-2xl">
          {market.title}
        </h2>
        {market.subtitle && (
          <p className="mt-1 text-sm leading-relaxed text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {market.subtitle}
          </p>
        )}

        <ul className="mt-4 space-y-1.5">
          {chartOutcomes.map((o) => {
            const mult = formatMultiplier(o.yes?.ask);
            return (
              <li key={o.externalId} className="flex items-center gap-2.5">
                {!binary && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colorByKey.get(o.externalId) }}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {binary ? "Yes" : o.title}
                </span>
                <span className="w-11 shrink-0 text-right text-sm font-extrabold tabular-nums">
                  {formatPercent(o.yesMid)}
                </span>
                {mult && (
                  <span className="hidden w-14 shrink-0 text-right text-xs font-semibold text-slate-400 sm:block">
                    {mult} payout
                  </span>
                )}
                <button
                  onClick={goTicket(o.externalId)}
                  className="w-24 shrink-0 rounded-lg bg-yes-soft py-1.5 text-sm font-bold text-yes-strong transition hover:bg-yes hover:text-white"
                >
                  Yes {o.yes ? formatCents(o.yes.ask) : "–"}
                </button>
              </li>
            );
          })}
        </ul>
        {market.outcomesTotal > HERO_ROWS && (
          <div className="mt-2 text-xs font-semibold text-brand">
            +{market.outcomesTotal - HERO_ROWS} more outcomes →
          </div>
        )}
        <div className="mt-auto" />
      </div>

      <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
        <PriceChart series={series} compact />
      </div>
    </div>
  );
}

export function HeroCarousel({ featured }: { featured: FeaturedMarket[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const count = featured.length;

  useEffect(() => {
    if (paused || count <= 1) return;
    timer.current = setInterval(() => setIdx((i) => (i + 1) % count), ADVANCE_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [paused, count]);

  if (count === 0) return null;
  const current = featured[Math.min(idx, count - 1)];

  return (
    <section
      aria-label="Featured markets"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="hero-carousel"
    >
      <HeroSlide key={current.uuid} market={current} />
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            aria-label="Previous featured market"
            onClick={() => setIdx((i) => (i - 1 + count) % count)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-slate-500 transition hover:text-ink"
          >
            ‹
          </button>
          <div className="flex gap-1.5">
            {featured.map((m, i) => (
              <button
                key={m.uuid}
                aria-label={`Featured market ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-5 bg-ink" : "w-1.5 bg-slate-300 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>
          <button
            aria-label="Next featured market"
            onClick={() => setIdx((i) => (i + 1) % count)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-white text-slate-500 transition hover:text-ink"
          >
            ›
          </button>
        </div>
      )}
    </section>
  );
}
