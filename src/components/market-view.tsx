"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePolledJson } from "@/components/fetcher";
import { PriceChart } from "@/components/price-chart";
import { TradeTicket, type TicketSide } from "@/components/trade-ticket";
import { Badge, CategoryTile, ErrorNote, PageLoader } from "@/components/ui";
import type { MarketDetailView, OutcomeView } from "@/lib/markets";
import { formatCents, formatPercent } from "@/lib/money";

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function OutcomeRow({
  outcome,
  selected,
  resolved,
  onPick,
}: {
  outcome: OutcomeView;
  selected: boolean;
  resolved: boolean;
  onPick: (side: TicketSide) => void;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
        selected ? "border-brand bg-brand/[0.04]" : "border-line bg-white"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{outcome.title}</div>
        <div className="text-xs text-slate-400">{outcome.externalId}</div>
      </div>
      <div className="w-14 text-right text-lg font-extrabold tabular-nums">
        {formatPercent(outcome.yesMid)}
      </div>
      {resolved ? (
        <Badge tone={outcome.result ? "yes" : "slate"}>
          {outcome.result ? "YES won" : "NO won"}
        </Badge>
      ) : (
        <div className="grid w-48 shrink-0 grid-cols-2 gap-2">
          <button
            onClick={() => onPick("yes")}
            className="rounded-lg bg-yes-soft py-1.5 text-sm font-bold text-yes-strong transition hover:bg-yes hover:text-white"
          >
            Yes {outcome.yes ? formatCents(outcome.yes.ask) : "–"}
          </button>
          <button
            onClick={() => onPick("no")}
            className="rounded-lg bg-no-soft py-1.5 text-sm font-bold text-no-strong transition hover:bg-no hover:text-white"
          >
            No {outcome.no ? formatCents(outcome.no.ask) : "–"}
          </button>
        </div>
      )}
    </li>
  );
}

export function MarketView({ uuid }: { uuid: string }) {
  const searchParams = useSearchParams();
  const { data, error, loading, refresh } = usePolledJson<{ market: MarketDetailView }>(
    `/api/markets/${uuid}`,
    5_000,
  );
  const market = data?.market ?? null;

  const [picked, setPicked] = useState<string | null>(searchParams.get("outcome"));
  const [side, setSide] = useState<TicketSide>(
    searchParams.get("side") === "no" ? "no" : "yes",
  );

  const outcomes = useMemo(() => market?.outcomes ?? [], [market]);
  const selected =
    outcomes.find((o) => o.externalId === picked) ?? outcomes[0] ?? null;

  // Keep an explicit selection once outcomes load (so the ticket doesn't jump
  // when polling re-sorts rows by price).
  useEffect(() => {
    if (!picked && outcomes.length > 0) setPicked(outcomes[0].externalId);
  }, [picked, outcomes]);

  if (loading && !market) return <PageLoader label="Loading market…" />;
  if (error && !market) return <ErrorNote message={error} />;
  if (!market || !selected) return <ErrorNote message="Market not found." />;

  const resolved = market.status === "RESOLVED";
  const binary = market.outcomes.length <= 1;
  const closes = fmtDate(market.closeDate);
  const resolvedAt = fmtDate(market.resolvedDate);
  const winner = resolved ? outcomes.find((o) => o.result === true) : null;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <div className="space-y-4">
        <header className="flex items-start gap-4">
          <CategoryTile category={market.category} imageUrl={market.imageUrl || undefined} size="lg" />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge>{market.category}</Badge>
              {resolved && <Badge tone="amber">Resolved</Badge>}
              {!resolved && closes && (
                <span className="text-xs text-slate-400">Closes {closes}</span>
              )}
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">
              {market.title}
            </h1>
            {market.subtitle && (
              <p className="mt-1 text-sm text-slate-500">{market.subtitle}</p>
            )}
          </div>
        </header>

        {resolved && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This market resolved{resolvedAt ? ` on ${resolvedAt}` : ""}
            {winner ? (
              <>
                {" "}— outcome: <strong>{winner.title}</strong>. Winning contracts settled at
                $1.00, losing contracts at $0.00; positions were closed automatically by the
                platform.
              </>
            ) : (
              "."
            )}
          </div>
        )}

        <PriceChart
          symbol={selected.instrumentYesName}
          livePrice={selected.yesMid}
          title={binary ? "Chance of YES" : `${selected.title} — chance of YES`}
        />

        {!binary && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
              Outcomes
            </h2>
            <ul className="space-y-2">
              {outcomes.map((o) => (
                <OutcomeRow
                  key={o.externalId}
                  outcome={o}
                  selected={o.externalId === selected.externalId}
                  resolved={resolved}
                  onPick={(s) => {
                    setPicked(o.externalId);
                    setSide(s);
                  }}
                />
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-xl border border-line bg-white p-4 text-sm leading-relaxed text-slate-600 shadow-card">
          <h2 className="mb-1 text-sm font-bold text-ink">Rules</h2>
          <p>
            {market.subtitle ??
              "This market settles per the event terms configured by the broker."}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
            {closes && <li>Trading closes: {closes} (GMT)</li>}
            {resolvedAt && <li>Resolved: {resolvedAt} (GMT)</li>}
            <li>
              Instruments: {selected.instrumentYesName} / {selected.instrumentNoName}
            </li>
            <li>Winning side settles at $1.00 per contract; the losing side at $0.00.</li>
          </ul>
        </section>
      </div>

      <div className="mt-6 lg:mt-0">
        <div className="lg:sticky lg:top-24">
          {resolved ? (
            <aside className="rounded-xl border border-line bg-white p-5 text-sm text-slate-500 shadow-card">
              <div className="mb-1 text-lg font-bold text-ink">Market resolved</div>
              Trading is closed. Settled positions appear in your{" "}
              <a href="/portfolio" className="font-semibold text-brand underline">
                portfolio history
              </a>
              .
            </aside>
          ) : (
            <TradeTicket
              marketTitle={binary ? market.title : selected.title}
              outcome={selected}
              side={side}
              onSideChange={setSide}
              binary={binary}
              onTraded={refresh}
            />
          )}
        </div>
      </div>
    </div>
  );
}
