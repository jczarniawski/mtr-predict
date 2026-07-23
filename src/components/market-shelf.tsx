"use client";

import Link from "next/link";
import { MarketCard } from "@/components/market-card";
import type { MarketSummary } from "@/lib/markets";

/** A category row on the home page: header + horizontally scrolling cards. */
export function MarketShelf({
  category,
  markets,
}: {
  category: string;
  markets: MarketSummary[];
}) {
  if (markets.length === 0) return null;
  return (
    <section aria-label={category} data-testid={`shelf-${category}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold tracking-tight">{category}</h2>
        <Link
          href={`/?category=${encodeURIComponent(category)}`}
          className="text-sm font-semibold text-brand transition hover:text-brand-dark"
        >
          See all →
        </Link>
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-1">
        {markets.map((m) => (
          <div key={m.uuid} className="w-[320px] shrink-0 snap-start">
            <MarketCard market={m} />
          </div>
        ))}
      </div>
    </section>
  );
}
