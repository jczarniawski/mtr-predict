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
  formatMultiplier,
  positionCost,
  positionPayout,
  potentialProfit,
} from "@/lib/money";

export type TicketSide = "yes" | "no";
type EntryMode = "contracts" | "amount";

interface TradeResponse {
  accepted: boolean;
  orderId: string | null;
  volume: number;
}

const MAX_CONTRACTS = 25_000;

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
  const [mode, setMode] = useState<EntryMode>("contracts");
  const [contracts, setContracts] = useState(10);
  const [amount, setAmount] = useState(10);
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
      <aside className="rounded-2xl border border-line bg-white p-5 text-sm text-slate-500 shadow-card">
        Pick an outcome to trade.
      </aside>
    );
  }

  const price = side === "yes" ? (outcome.yes?.ask ?? null) : (outcome.no?.ask ?? null);
  const symbol = side === "yes" ? outcome.instrumentYesName : outcome.instrumentNoName;

  // In $ mode the amount drives the contract count at the current price.
  const effectiveContracts =
    mode === "contracts"
      ? contracts
      : price && price > 0
        ? Math.max(1, Math.min(MAX_CONTRACTS, Math.floor(amount / price)))
        : 0;

  const cost = price != null ? positionCost(effectiveContracts, price) : null;
  const payout = positionPayout(effectiveContracts);
  const profit = price != null ? potentialProfit(effectiveContracts, price) : null;
  const multiplier = formatMultiplier(price);
  const signedIn = !!me?.account;
  const freeMargin = me?.account?.freeMargin ?? null;
  const currency = me?.account?.currency ?? "USD";
  const insufficient = signedIn && cost != null && freeMargin != null && cost > freeMargin;

  const submit = async () => {
    if (!price || pending || effectiveContracts <= 0) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchJson<TradeResponse>("/api/trade/open", {
        method: "POST",
        body: JSON.stringify({ symbol, volume: effectiveContracts }),
      });
      setSuccess(
        `${res.volume} contract${res.volume === 1 ? "" : "s"} of ${side === "yes" ? "YES" : "NO"} accepted.`,
      );
      refresh();
      onTraded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Order failed. Try again.");
    } finally {
      setPending(false);
    }
  };

  const setQty = (v: number) => setContracts(Math.max(1, Math.min(MAX_CONTRACTS, Math.round(v))));
  const setAmt = (v: number) => setAmount(Math.max(1, Math.min(1_000_000, Math.round(v))));

  return (
    <aside className="rounded-2xl border border-line bg-white p-5 shadow-card" data-testid="trade-ticket">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Buy {binary ? "" : "· " + outcome.title}
      </div>
      <h3 className="mb-4 text-[15px] font-semibold leading-snug">{marketTitle}</h3>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => onSideChange("yes")}
          className={`rounded-xl py-2.5 text-sm font-bold transition ${
            side === "yes"
              ? "bg-yes text-white shadow-card"
              : "bg-yes-soft text-yes-strong hover:bg-yes-soft/70"
          }`}
        >
          Yes {outcome.yes ? formatCents(outcome.yes.ask) : "–"}
        </button>
        <button
          onClick={() => onSideChange("no")}
          className={`rounded-xl py-2.5 text-sm font-bold transition ${
            side === "no"
              ? "bg-no text-white shadow-card"
              : "bg-no-soft text-no-strong hover:bg-no-soft/70"
          }`}
        >
          No {outcome.no ? formatCents(outcome.no.ask) : "–"}
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-500">
          {mode === "contracts" ? "Contracts" : "Amount"}
        </label>
        <div className="grid grid-cols-2 rounded-lg bg-canvas p-0.5 text-[11px] font-bold">
          <button
            onClick={() => setMode("contracts")}
            className={`rounded-md px-2 py-1 transition ${
              mode === "contracts" ? "bg-white text-ink shadow-card" : "text-slate-400"
            }`}
            data-testid="mode-contracts"
          >
            Contracts
          </button>
          <button
            onClick={() => setMode("amount")}
            className={`rounded-md px-2 py-1 transition ${
              mode === "amount" ? "bg-white text-ink shadow-card" : "text-slate-400"
            }`}
            data-testid="mode-amount"
          >
            $ Amount
          </button>
        </div>
      </div>

      {mode === "contracts" ? (
        <>
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
        </>
      ) : (
        <>
          <div className="relative mb-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
              $
            </span>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmt(Number(e.target.value) || 1)}
              className="h-9 w-full rounded-lg border border-line pl-7 pr-3 text-center text-sm font-bold tabular-nums outline-none focus:border-brand"
            />
          </div>
          <div className="mb-1 flex gap-1.5">
            {[10, 50, 100, 500].map((v) => (
              <button
                key={v}
                onClick={() => setAmt(v)}
                className="flex-1 rounded-md bg-canvas py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                ${v}
              </button>
            ))}
          </div>
          <div className="mb-4 text-center text-xs text-slate-400" data-testid="amount-contracts">
            ≈ {effectiveContracts.toLocaleString("en-US")} contract
            {effectiveContracts === 1 ? "" : "s"} at {formatCents(price)}
          </div>
        </>
      )}

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
          <dt className="text-slate-500">To win if {side === "yes" ? "Yes" : "No"}</dt>
          <dd className="font-bold tabular-nums text-yes-strong">
            {formatMoney(payout, currency)}
            {multiplier && (
              <span className="ml-1.5 rounded-md bg-yes-soft px-1.5 py-0.5 text-[11px] font-bold text-yes-strong">
                {multiplier}
              </span>
            )}
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
            disabled={pending || price == null || insufficient || effectiveContracts <= 0}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
              side === "yes" ? "bg-yes hover:bg-yes-strong" : "bg-no hover:bg-no-strong"
            }`}
            data-testid="buy-button"
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
          className="block w-full rounded-xl bg-brand py-3 text-center text-sm font-bold text-white transition hover:bg-brand-dark"
        >
          Sign in to trade
        </Link>
      )}

      {error && <p className="mt-3 text-sm font-medium text-no-strong">{error}</p>}
      {success && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-yes/25 bg-yes-softer px-3 py-2.5">
          <span className="flex h-6 w-6 shrink-0 animate-[pop_.25s_ease-out] items-center justify-center rounded-full bg-yes text-xs font-bold text-white">
            ✓
          </span>
          <p className="text-sm font-medium text-yes-strong">
            {success}{" "}
            <Link href="/portfolio" className="underline">
              View portfolio
            </Link>
          </p>
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-slate-400">
        Orders fill at market via the Broker API. Each contract pays {formatMoney(1, currency)} if
        it settles your way, {formatMoney(0, currency)} otherwise. Sell anytime from your
        portfolio.
      </p>
    </aside>
  );
}
