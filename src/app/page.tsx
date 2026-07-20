"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePolledJson } from "@/components/fetcher";
import { MarketCard } from "@/components/market-card";
import { ErrorNote, PageLoader } from "@/components/ui";
import type { MarketSummary } from "@/lib/markets";

interface MarketsResponse {
  markets: MarketSummary[];
  categories: string[];
}

const RESOLVED = "__resolved__";

function CategoryTabs({
  categories,
  active,
  onSelect,
}: {
  categories: string[];
  active: string | null;
  onSelect: (c: string | null) => void;
}) {
  const chip = (label: string, value: string | null) => {
    const isActive = active === value;
    return (
      <button
        key={label}
        onClick={() => onSelect(value)}
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
          isActive ? "bg-ink text-white" : "bg-white text-slate-600 border border-line hover:border-slate-300"
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {chip("All", null)}
      {categories.map((c) => chip(c, c))}
      {chip("Resolved", RESOLVED)}
    </div>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category");

  const apiParams = new URLSearchParams();
  if (q) apiParams.set("q", q);
  if (category === RESOLVED) apiParams.set("status", "RESOLVED");
  else if (category) apiParams.set("category", category);

  const { data, error, loading } = usePolledJson<MarketsResponse>(
    `/api/markets?${apiParams.toString()}`,
    6_000,
  );

  const setCategory = (c: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (c) params.set("category", c);
    else params.delete("category");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <CategoryTabs
        categories={data?.categories ?? []}
        active={category}
        onSelect={setCategory}
      />

      {q && (
        <p className="text-sm text-slate-500">
          Results for <span className="font-semibold text-ink">“{q}”</span>
        </p>
      )}

      {error && <ErrorNote message={error} />}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-line bg-white" />
          ))}
        </div>
      ) : data && data.markets.length === 0 ? (
        <div className="rounded-xl border border-line bg-white py-16 text-center text-sm text-slate-500">
          No markets match{q ? ` “${q}”` : " this filter"}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.markets.map((m) => <MarketCard key={m.uuid} market={m} />)}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <HomeInner />
    </Suspense>
  );
}
