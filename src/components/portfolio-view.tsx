"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, fetchJson, usePolledJson } from "@/components/fetcher";
import { useSession } from "@/components/session-context";
import { Badge, ErrorNote, PageLoader, Spinner } from "@/components/ui";
import type { ClosedPositionView, PortfolioView, PositionView } from "@/lib/portfolio";
import { formatCents, formatMoney, formatSignedMoney } from "@/lib/money";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "pnl-pos" | "pnl-neg" }) {
  const color =
    tone === "pnl-pos" ? "text-yes-strong" : tone === "pnl-neg" ? "text-no-strong" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function MarketCell({ p }: { p: PositionView | ClosedPositionView }) {
  const label = p.market?.betTitle ?? p.symbol;
  const sideTone = p.market?.side === "NO" ? "no" : "yes";
  return (
    <div className="min-w-0">
      {p.market ? (
        <Link
          href={`/market/${p.market.betUuid}`}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {label}
        </Link>
      ) : (
        <span className="block truncate text-sm font-semibold">{label}</span>
      )}
      <div className="mt-0.5 flex items-center gap-1.5">
        <Badge tone={sideTone}>{p.market?.side ?? p.side}</Badge>
        {p.market && p.market.outcomeTitle.toLowerCase() !== "yes" && (
          <span className="truncate text-xs text-slate-400">{p.market.outcomeTitle}</span>
        )}
      </div>
    </div>
  );
}

function SellControls({
  position,
  currency,
  onDone,
}: {
  position: PositionView;
  currency: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(position.volume);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sell = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await fetchJson("/api/trade/close", {
        method: "POST",
        body: JSON.stringify({
          positionId: position.id,
          volume: qty >= position.volume ? undefined : qty,
        }),
      });
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sell failed.");
    } finally {
      setPending(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setQty(position.volume);
          setOpen(true);
        }}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-no hover:bg-no-softer hover:text-no-strong"
      >
        Sell
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={position.volume}
          value={qty}
          onChange={(e) =>
            setQty(Math.max(1, Math.min(position.volume, Math.round(Number(e.target.value) || 1))))
          }
          className="h-8 w-20 rounded-lg border border-line px-2 text-center text-xs font-bold tabular-nums outline-none focus:border-brand"
        />
        <button
          onClick={sell}
          disabled={pending}
          className="h-8 rounded-lg bg-no px-3 text-xs font-bold text-white transition hover:bg-no-strong disabled:opacity-50"
        >
          {pending ? <Spinner className="border-white/40 border-t-white" /> : "Confirm"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="h-8 rounded-lg px-2 text-xs font-semibold text-slate-400 hover:bg-canvas"
        >
          ✕
        </button>
      </div>
      <span className="text-[10px] text-slate-400">
        at market ≈ {position.currentPrice != null ? formatCents(position.currentPrice) : "–"} ·{" "}
        {formatMoney((position.currentPrice ?? 0) * qty, currency)}
      </span>
      {error && <span className="text-[10px] font-medium text-no-strong">{error}</span>}
    </div>
  );
}

function TopUp({ currency, onDone }: { currency: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = async () => {
    if (pending) return; // deposits are non-idempotent — never double-send
    setPending(true);
    setError(null);
    try {
      await fetchJson("/api/account/deposit", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Deposit failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {open ? (
        <>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            className="h-9 w-28 rounded-lg border border-line px-2 text-center text-sm font-bold tabular-nums outline-none focus:border-brand"
          />
          <button
            onClick={deposit}
            disabled={pending}
            className="h-9 rounded-lg bg-brand px-3 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {pending ? "…" : `Add ${formatMoney(amount, currency, 0)}`}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-9 rounded-lg px-2 text-sm text-slate-400 hover:bg-canvas"
          >
            ✕
          </button>
          {error && <span className="text-xs font-medium text-no-strong">{error}</span>}
        </>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="h-9 rounded-lg border border-line px-3 text-sm font-bold text-slate-600 transition hover:border-brand hover:text-brand"
        >
          + Top up demo funds
        </button>
      )}
    </div>
  );
}

export function Portfolio() {
  const { me, refresh: refreshSession } = useSession();
  const signedIn = !!me?.account;
  const { data, error, loading, refresh } = usePolledJson<{ portfolio: PortfolioView }>(
    signedIn ? "/api/portfolio" : null,
    5_000,
  );
  const [tab, setTab] = useState<"positions" | "history">("positions");

  if (me && !signedIn) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-8 text-center shadow-card">
        <div className="mb-2 text-3xl">📊</div>
        <h1 className="mb-1 text-xl font-extrabold">Your portfolio lives here</h1>
        <p className="mb-5 text-sm text-slate-500">
          Sign in to see positions, live P&L and trade history.
        </p>
        <Link
          href="/auth"
          className="inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
        >
          Sign in / create account
        </Link>
      </div>
    );
  }

  if ((loading && !data) || !me) return <PageLoader label="Loading portfolio…" />;
  if (error && !data) return <ErrorNote message={error} />;
  const view = data?.portfolio;
  if (!view) return <ErrorNote message="Portfolio unavailable." />;

  const { account, positions, closed, totals } = view;
  const done = () => {
    refresh();
    refreshSession();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Portfolio</h1>
          <p className="text-sm text-slate-400">
            {account.name} · login {account.login} · {account.accountType} · {account.group}
          </p>
        </div>
        {me.depositsEnabled && account.accountType === "DEMO" && (
          <TopUp currency={account.currency} onDone={done} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Equity" value={formatMoney(account.equity, account.currency)} />
        <StatCard label="Cash balance" value={formatMoney(account.balance, account.currency)} />
        <StatCard
          label="Open P&L"
          value={formatSignedMoney(account.profit, account.currency)}
          tone={account.profit >= 0 ? "pnl-pos" : "pnl-neg"}
        />
        <StatCard label="Available to trade" value={formatMoney(account.freeMargin, account.currency)} />
      </div>

      <div className="flex gap-1 border-b border-line">
        {(["positions", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold capitalize transition ${
              tab === t ? "border-ink text-ink" : "border-transparent text-slate-400 hover:text-ink"
            }`}
          >
            {t === "positions" ? `Positions (${positions.length})` : `History (${closed.length})`}
          </button>
        ))}
      </div>

      {tab === "positions" ? (
        positions.length === 0 ? (
          <EmptyState
            title="No open positions"
            body="Buy Yes or No on any market to get started."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Market</th>
                  <th className="px-3 py-3 text-right">Contracts</th>
                  <th className="px-3 py-3 text-right">Avg price</th>
                  <th className="px-3 py-3 text-right">Latest</th>
                  <th className="px-3 py-3 text-right">Value</th>
                  <th className="px-3 py-3 text-right">P&L</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 last:border-0">
                    <td className="max-w-[260px] px-4 py-3">
                      <MarketCell p={p} />
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{p.volume}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatCents(p.openPrice)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {p.currentPrice != null ? formatCents(p.currentPrice) : "–"}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      {p.value != null ? formatMoney(p.value, account.currency) : "–"}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-bold tabular-nums ${
                        (p.pnl ?? 0) >= 0 ? "text-yes-strong" : "text-no-strong"
                      }`}
                    >
                      {formatSignedMoney(p.pnl, account.currency)}
                      {p.pnlPct != null && (
                        <span className="block text-[10px] font-semibold opacity-70">
                          {p.pnlPct >= 0 ? "+" : ""}
                          {p.pnlPct.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <SellControls position={p} currency={account.currency} onDone={done} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-canvas/60 text-xs font-bold">
                  <td className="px-4 py-2.5">Total</td>
                  <td></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(totals.cost, account.currency)}
                  </td>
                  <td></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(totals.value, account.currency)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums ${
                      totals.pnl >= 0 ? "text-yes-strong" : "text-no-strong"
                    }`}
                  >
                    {formatSignedMoney(totals.pnl, account.currency)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      ) : closed.length === 0 ? (
        <EmptyState title="No trade history yet" body="Closed and settled positions appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Market</th>
                <th className="px-3 py-3 text-right">Contracts</th>
                <th className="px-3 py-3 text-right">Open → Close</th>
                <th className="px-3 py-3 text-right">P&L</th>
                <th className="px-4 py-3 text-right">Closed</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((c, i) => (
                <tr key={`${c.id}-${i}`} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[280px] px-4 py-3">
                    <MarketCell p={c} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{c.volume}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCents(c.openPrice)} → {formatCents(c.closePrice)}
                    {c.settled && (
                      <span className="ml-1.5 align-middle">
                        <Badge tone="amber">Settled</Badge>
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-bold tabular-nums ${
                      c.netProfit >= 0 ? "text-yes-strong" : "text-no-strong"
                    }`}
                  >
                    {formatSignedMoney(c.netProfit, account.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-400">
                    {new Date(c.closeTime).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-white py-14 text-center shadow-card">
      <div className="text-sm font-bold">{title}</div>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
      >
        Browse markets
      </Link>
    </div>
  );
}
