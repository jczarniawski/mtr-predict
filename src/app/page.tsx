"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePolledJson } from "@/components/fetcher";
import { HeroCarousel } from "@/components/hero-carousel";
import { MarketCard } from "@/components/market-card";
import { MarketShelf } from "@/components/market-shelf";
import { Movers } from "@/components/movers";
import { ErrorNote, PageLoader } from "@/components/ui";
import type { HomeView, MarketSummary } from "@/lib/markets";

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
          isActive
            ? "bg-ink text-white"
            : "border border-line bg-white text-slate-600 hover:border-slate-300"
        }`}
        data-testid={`category-${label}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-line/60 bg-canvas/90 px-4 py-2.5 backdrop-blur">
      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        {chip("All", null)}
        {categories.map((c) => chip(c, c))}
        {chip("Resolved", RESOLVED)}
      </div>
    </div>
  );
}

function MobileSearch() {
  const router = useRouter();
  return (
    <form
      className="sm:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        router.push(q ? `/?q=${encodeURIComponent(String(q))}` : "/");
      }}
    >
      <input
        name="q"
        placeholder="Search markets"
        className="w-full rounded-full border border-line bg-white px-4 py-2.5 text-sm shadow-card outline-none focus:border-brand"
      />
    </form>
  );
}

/** Default (unfiltered) home: featured hero, movers, category shelves. */
function HomeFeed({
  home,
  error,
  loading,
}: {
  home: HomeView | null;
  error: string | null;
  loading: boolean;
}) {
  if (loading && !home) {
    return (
      <div className="space-y-6">
        <div className="h-72 animate-pulse rounded-2xl border border-line bg-white" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-white" />
          ))}
        </div>
      </div>
    );
  }
  if (error && !home) return <ErrorNote message={error} />;
  if (!home) return null;

  return (
    <div className="space-y-8">
      <HeroCarousel featured={home.featured} />
      <Movers movers={home.movers} />
      {home.sections.map((s) => (
        <MarketShelf key={s.category} category={s.category} markets={s.markets} />
      ))}
    </div>
  );
}

/** Filtered view: category / search / resolved grid. */
function FilteredGrid({ q, category }: { q: string; category: string | null }) {
  const apiParams = new URLSearchParams();
  if (q) apiParams.set("q", q);
  if (category === RESOLVED) apiParams.set("status", "RESOLVED");
  else if (category) apiParams.set("category", category);

  const { data, error, loading } = usePolledJson<MarketsResponse>(
    `/api/markets?${apiParams.toString()}`,
    6_000,
  );

  return (
    <>
      {q && (
        <p className="text-sm text-slate-500">
          Results for <span className="font-semibold text-ink">“{q}”</span>
        </p>
      )}
      {error && <ErrorNote message={error} />}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-line bg-white" />
          ))}
        </div>
      ) : data && data.markets.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white py-16 text-center text-sm text-slate-500">
          No markets match{q ? ` “${q}”` : " this filter"}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.markets.map((m) => <MarketCard key={m.uuid} market={m} />)}
        </div>
      )}
    </>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category");
  const filtered = !!q || !!category;

  // One home fetch powers both the feed and the category tabs; the filtered
  // view fetches a light list just for the tab row.
  const {
    data: homeData,
    error: homeError,
    loading: homeLoading,
  } = usePolledJson<{ home: HomeView }>(filtered ? null : "/api/markets?view=home", 10_000);
  const { data: listData } = usePolledJson<MarketsResponse>(
    filtered ? "/api/markets?limit=1" : null,
    0,
  );
  const categories = homeData?.home.categories ?? listData?.categories ?? [];

  const setCategory = (c: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (c) params.set("category", c);
    else params.delete("category");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="space-y-5">
      <MobileSearch />
      <CategoryTabs categories={categories} active={category} onSelect={setCategory} />
      {filtered ? (
        <FilteredGrid q={q} category={category} />
      ) : (
        <HomeFeed home={homeData?.home ?? null} error={homeError} loading={homeLoading} />
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
