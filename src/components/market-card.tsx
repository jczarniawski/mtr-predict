"use client";

import { useRouter } from "next/navigation";
import type { MarketSummary, OutcomeView } from "@/lib/markets";
import { formatCents, formatPercent } from "@/lib/money";
import { CategoryTile, ChangeChip } from "@/components/ui";

function closeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function YesNoButtons({
  outcome,
  betUuid,
  size = "md",
}: {
  outcome: OutcomeView;
  betUuid: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const pad = size === "md" ? "py-2" : "py-1";
  const go = (side: "yes" | "no") => (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/market/${betUuid}?outcome=${encodeURIComponent(outcome.externalId)}&side=${side}`);
  };
  return (
    <div className={`grid grid-cols-2 gap-2 ${size === "md" ? "" : "w-44 shrink-0"}`}>
      <button
        onClick={go("yes")}
        className={`rounded-lg bg-yes-soft ${pad} px-2 text-sm font-bold text-yes-strong transition hover:bg-yes hover:text-white`}
      >
        Yes {outcome.yes ? formatCents(outcome.yes.ask) : "–"}
      </button>
      <button
        onClick={go("no")}
        className={`rounded-lg bg-no-soft ${pad} px-2 text-sm font-bold text-no-strong transition hover:bg-no hover:text-white`}
      >
        No {outcome.no ? formatCents(outcome.no.ask) : "–"}
      </button>
    </div>
  );
}

/** Thin probability meter for binary cards — chance of YES at a glance. */
function ChanceBar({ yesMid }: { yesMid: number | null }) {
  if (yesMid == null) return null;
  return (
    <div className="mb-2.5 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div
        className="h-full rounded-full bg-yes transition-all duration-500"
        style={{ width: `${Math.round(yesMid * 100)}%` }}
      />
    </div>
  );
}

export function MarketCard({ market }: { market: MarketSummary }) {
  const router = useRouter();
  const isBinary = market.outcomesTotal <= 1;
  const top = market.outcomes[0];
  const closes = closeLabel(market.closeDate);
  const resolved = market.status === "RESOLVED";

  return (
    <div
      onClick={() => router.push(`/market/${market.uuid}`)}
      className="flex h-full cursor-pointer flex-col rounded-2xl border border-line bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-pop"
      data-testid="market-card"
    >
      <div className="flex items-start gap-3">
        <CategoryTile category={market.category} imageUrl={market.imageUrl || undefined} />
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {market.title}
        </h3>
        {isBinary && top?.yesMid != null && (
          <div className="text-right">
            <div className="text-xl font-extrabold tabular-nums text-ink">
              {formatPercent(top.yesMid)}
            </div>
            <div className="-mt-0.5 text-[11px] font-medium text-slate-400">chance</div>
          </div>
        )}
      </div>

      <div className={`mt-3 flex-1 ${isBinary ? "flex flex-col justify-end" : ""}`}>
        {isBinary && top ? (
          resolved ? (
            <ResolvedLine outcome={top} binary />
          ) : (
            <>
              <ChanceBar yesMid={top.yesMid} />
              <YesNoButtons outcome={top} betUuid={market.uuid} />
            </>
          )
        ) : (
          <ul className="space-y-1.5">
            {market.outcomes.slice(0, 3).map((o) => (
              <li key={o.externalId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.title}</span>
                <span className="w-10 shrink-0 text-right text-sm font-bold tabular-nums">
                  {formatPercent(o.yesMid)}
                </span>
                {resolved ? (
                  <ResolvedLine outcome={o} />
                ) : (
                  <YesNoButtons outcome={o} betUuid={market.uuid} size="sm" />
                )}
              </li>
            ))}
            {market.outcomesTotal > 3 && (
              <li className="pt-0.5 text-xs font-medium text-slate-400">
                +{market.outcomesTotal - 3} more outcomes
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-xs text-slate-400">
        <span>
          {resolved ? "Resolved" : closes ? `Closes ${closes}` : market.category}
          {!resolved && closes ? ` · ${market.category}` : ""}
        </span>
        {!resolved && <ChangeChip change={top?.dailyChange ?? null} />}
      </div>
    </div>
  );
}

function ResolvedLine({ outcome, binary = false }: { outcome: OutcomeView; binary?: boolean }) {
  const won = outcome.result === true;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold ${
        won ? "bg-yes-soft text-yes-strong" : "bg-slate-100 text-slate-500"
      } ${binary ? "w-full justify-center py-2 text-sm" : "w-44 justify-center shrink-0"}`}
    >
      {won ? "✓ YES won" : "NO won"}
    </span>
  );
}
