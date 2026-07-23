"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, fetchJson } from "@/components/fetcher";
import { useSession } from "@/components/session-context";
import { Spinner } from "@/components/ui";
import type { OutcomeView } from "@/lib/markets";
import {
  formatCents,
  formatMoney,
  positionCost,
  positionPayout,
  potentialProfit,
} from "@/lib/money";

export type TicketSide = "yes" | "no";

interface TradeResponse {
  accepted: boolean;
  orderId: string | null;
  volume: number;
}

export function TradeTicket({
  marketTitle,
  outcome,
  side,
  onSideChange,
  binary,
  onTraded,
}: {
  marketTitle: string;
  outcome: OutcomeView | null;
  side: TicketSide;
  onSideChange: (s: TicketSide) => void;
  binary: boolean;
  onTraded: () => void;
}) {
  const { me, refresh } = useSession();
  const [contracts, setContracts] = useState(10);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // A new outcome/side selection is a new order — clear the last result.
  useEffect(() => {
    setError(null);
    setSuccess(null);
  }, [outcome?.externalId, side]);

  if (!outcome) {
    return (
      <aside className="rounded-xl border border-line bg-white p-5 text-sm text-slate-500 shadow-card">
        Pick an outcome to trade.
      </aside>
    );
  }

  const price = side === "yes" ? (outcome.yes?.ask ?? null) : (outcome.no?.ask ?? null);
  const symbol = side === "yes" ? outcome.instrumentYesName : outcome.instrumentNoName;
  const cost = price != null ? positionCost(contracts, price) : null;
  const payout = positionPayout(contracts);
  const profit = price != null ? potentialProfit(contracts, price) : null;
  const signedIn = !!me?.account;
  const freeMargin = me?.account?.freeMargin ?? null;
  const currency = me?.account?.currency ?? "USD";
  const insufficient =
    signedIn && cost != null && freeMargin != null && cost > freeMargin;

  const submit = async () => {
    if (!price || pending) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchJson<TradeResponse>("/api/trade/open", {
        method: "POST",
        body: JSON.stringify({ symbol, volume: contracts }),
      });
      setSuccess(
        `Order accepted — ${res.volume} contract${res.volume === 1 ? "" : "s"} of ${
          side === "yes" ? "YES" : "NO"
        }.`,
      );
      refresh();
      onTraded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Order failed. Try again.");
    } finally {
      setPending(false);
    }
  };

  const setQty = (v: number) => setContracts(Math.max(1, Math.min(25_000, Math.round(v))));

  return (
    <aside className="rounded-xl border border-line bg-white p-5 shadow-card">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Buy {binary ? "" : "· " + outcome.title}
      </div>
      <h3 className="mb-4 text-[15px] font-semibold leading-snug">{marketTitle}</h3>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => onSideChange("yes")}
          className={`rounded-lg py-2.5 text-sm font-bold transition ${
            side === "yes"
              ? "bg-yes text-white shadow-card"
              : "bg-yes-soft text-yes-strong hover:bg-yes-soft/70"
          }`}
        >
          Yes {outcome.yes ? formatCents(outcome.yes.ask) : "–"}
        </button>
        <button
          onClick={() => onSideChange("no")}
          className={`rounded-lg py-2.5 text-sm font-bold transition ${
            side === "no"
              ? "bg-no text-white shadow-card"
              : "bg-no-soft text-no-strong hover:bg-no-soft/70"
          }`}
        >
          No {outcome.no ? formatCents(outcome.no.ask) : "–"}
        </button>
      </div>

      <label className="mb-1 block text-xs font-semibold text-slate-500">Contracts</label>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setQty(contracts - 10)}
          className="h-9 w-9 rounded-lg border border-line text-lg font-bold text-slate-500 hover:bg-canvas"
          aria-label="Minus 10"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          value={contracts}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
          className="h-9 w-full rounded-lg border border-line px-3 text-center text-sm font-bold tabular-nums outline-none focus:border-brand"
        />
        <button
          onClick={() => setQty(contracts + 10)}
          className="h-9 w-9 rounded-lg border border-line text-lg font-bold text-slate-500 hover:bg-canvas"
          aria-label="Plus 10"
        >
          +
        </button>
      </div>
      <div className="mb-4 flex gap-1.5">
        {[10, 50, 100, 500].map((v) => (
          <button
            key={v}
            onClick={() => setQty(v)}
            className="flex-1 rounded-md bg-canvas py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            {v}
          </button>
        ))}
      </div>

      <dl className="mb-4 space-y-1.5 border-t border-line pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Price per contract</dt>
          <dd className="font-bold tabular-nums">{formatCents(price)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Cost</dt>
          <dd className="font-bold tabular-nums">{cost != null ? formatMoney(cost, currency) : "–"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Payout if {side === "yes" ? "Yes" : "No"}</dt>
          <dd className="font-bold tabular-nums text-yes-strong">
            {formatMoney(payout, currency)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Potential profit</dt>
          <dd className="font-bold tabular-nums text-yes-strong">
            {profit != null ? `+${formatMoney(profit, currency)}` : "–"}
          </dd>
        </div>
      </dl>

      {signedIn ? (
        <>
          <button
            onClick={submit}
            disabled={pending || price == null || insufficient}
            className={`w-full rounded-lg py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
              side === "yes" ? "bg-yes hover:bg-yes-strong" : "bg-no hover:bg-no-strong"
            }`}
          >
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="border-white/40 border-t-white" /> Placing order…
              </span>
            ) : (
              `Buy ${side === "yes" ? "Yes" : "No"} · ${cost != null ? formatMoney(cost, currency) : ""}`
            )}
          </button>
          <div className="mt-2 text-center text-xs text-slate-400">
            {insufficient
              ? `Not enough free margin (${formatMoney(freeMargin, currency)} available).`
              : freeMargin != null
                ? `${formatMoney(freeMargin, currency)} available`
                : ""}
          </div>
        </>
      ) : (
        <Link
          href="/auth"
          className="block w-full rounded-lg bg-brand py-3 text-center text-sm font-bold text-white transition hover:bg-brand-dark"
        >
          Sign in to trade
        </Link>
      )}

      {error && <p className="mt-3 text-sm font-medium text-no-strong">{error}</p>}
      {success && (
        <p className="mt-3 text-sm font-medium text-yes-strong">
          ✓ {success}{" "}
          <Link href="/portfolio" className="underline">
            View portfolio
          </Link>
        </p>
      )}

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-slate-400">
        Orders fill at market via the Broker API. Each contract pays {formatMoney(1, currency)} if
        it settles your way, {formatMoney(0, currency)} otherwise. Sell anytime from your
        portfolio.
      </p>
    </aside>
  );
}
