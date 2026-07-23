"use client";

import Link from "next/link";
import { CategoryTile } from "@/components/ui";
import { formatPercent } from "@/lib/money";
import type { MoverView } from "@/lib/markets";

/** Horizontal strip of the day's biggest probability moves. */
export function Movers({ movers }: { movers: MoverView[] }) {
  if (movers.length === 0) return null;
  return (
    <section aria-label="Today's movers" data-testid="movers">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        Movers today
      </h2>
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {movers.map((m) => {
          const up = m.dailyChange > 0;
          return (
            <Link
              key={`${m.uuid}-${m.outcomeTitle ?? ""}`}
              href={`/market/${m.uuid}`}
              className="w-56 shrink-0 snap-start rounded-xl border border-line bg-white p-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
              data-testid="mover-card"
            >
              <div className="flex items-start gap-2.5">
                <CategoryTile category={m.category} imageUrl={m.imageUrl || undefined} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                    {m.title}
                  </div>
                  {m.outcomeTitle && (
                    <div className="mt-0.5 truncate text-xs text-slate-400">{m.outcomeTitle}</div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold tabular-nums">
                  {formatPercent(m.yesMid)}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${
                    up ? "bg-yes-soft text-yes-strong" : "bg-no-soft text-no-strong"
                  }`}
                >
                  {up ? "▲" : "▼"} {Math.abs(Math.round(m.dailyChange * 100))}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
