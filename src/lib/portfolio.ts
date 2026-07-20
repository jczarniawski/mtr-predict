import { getBroker, getMarketService, getQuoteService } from "@/lib/broker";
import type { SymbolMarketRef } from "@/lib/markets";
import type { ClosedPosition, OpenPosition, TradingAccount } from "@/lib/broker/types";
import { round2 } from "@/lib/money";

const CLOSED_LOOKBACK_DAYS = 90;

export interface MarketRefView {
  betUuid: string;
  betTitle: string;
  betStatus: string;
  outcomeTitle: string;
  side: "YES" | "NO";
}

export interface PositionView {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  openTime: string;
  market: MarketRefView | null;
  /** Price the position could be closed at right now (bid for BUY). */
  currentPrice: number | null;
  contractSize: number;
  cost: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

export interface ClosedPositionView {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  openTime: string;
  closePrice: number;
  closeTime: string;
  profit: number;
  netProfit: number;
  market: MarketRefView | null;
  settled: boolean;
}

export interface AccountView {
  login: string;
  name: string;
  group: string;
  accountType: string;
  currency: string;
  currencyPrecision: number;
  balance: number;
  equity: number;
  profit: number;
  margin: number;
  freeMargin: number;
}

export interface PortfolioView {
  account: AccountView;
  positions: PositionView[];
  closed: ClosedPositionView[];
  totals: { cost: number; value: number; pnl: number };
}

export function toAccountView(account: TradingAccount): AccountView {
  const fin = account.financeInfo;
  const first = account.accountDetails?.firstName ?? "";
  const last = account.accountDetails?.lastName ?? "";
  return {
    login: account.login,
    name: `${first} ${last}`.trim() || `Account ${account.login}`,
    group: account.group,
    accountType: account.accountType,
    currency: fin?.currency ?? "USD",
    currencyPrecision: fin?.currencyPrecision ?? 2,
    balance: fin?.balance ?? 0,
    equity: fin?.equity ?? 0,
    profit: fin?.profit ?? 0,
    margin: fin?.margin ?? 0,
    freeMargin: fin?.freeMargin ?? 0,
  };
}

export async function getPortfolio(login: string): Promise<PortfolioView> {
  const broker = getBroker();
  const markets = getMarketService();
  const quotes = getQuoteService();

  const to = new Date();
  const from = new Date(to.getTime() - CLOSED_LOOKBACK_DAYS * 86_400_000);

  const [account, openByAccount, closed] = await Promise.all([
    broker.getTradingAccount(login),
    broker.getOpenPositions(login),
    broker.getClosedPositions(login, from.toISOString(), to.toISOString()).catch(() => []),
  ]);

  const open = openByAccount.find((a) => a.login === login)?.positions ?? [];
  const allSymbols = [...open.map((p) => p.symbol), ...closed.map((c) => c.symbol)];
  const [refs, quoteMap, infoMap] = await Promise.all([
    markets.resolveSymbols(allSymbols),
    quotes.getQuotes(open.map((p) => p.symbol)),
    markets.getSymbolInfos(open.map((p) => p.symbol), account.group),
  ]);

  const positions = open
    .map((p) => {
      const q = quoteMap[p.symbol];
      const contractSize = infoMap.get(p.symbol)?.contractSize ?? 1;
      const currentPrice = q ? (p.side === "BUY" ? q.bid : q.ask) : (p.currentPrice ?? null);
      const cost = round2(p.volume * contractSize * p.openPrice);
      const value = currentPrice != null ? round2(p.volume * contractSize * currentPrice) : null;
      const pnl =
        currentPrice != null
          ? round2(
              (p.side === "BUY" ? currentPrice - p.openPrice : p.openPrice - currentPrice) *
                p.volume *
                contractSize,
            )
          : (p.profit ?? null);
      return {
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        volume: p.volume,
        openPrice: p.openPrice,
        openTime: p.openTime,
        market: toMarketRef(refs.get(p.symbol)),
        currentPrice,
        contractSize,
        cost,
        value,
        pnl,
        pnlPct: pnl != null && cost > 0 ? round2((pnl / cost) * 100) : null,
      } satisfies PositionView;
    })
    .sort((a, b) => (a.openTime < b.openTime ? 1 : -1));

  const closedViews = closed
    .map((c) => toClosedView(c, refs))
    .sort((a, b) => (a.closeTime < b.closeTime ? 1 : -1));

  const totals = positions.reduce(
    (acc, p) => ({
      cost: round2(acc.cost + p.cost),
      value: round2(acc.value + (p.value ?? p.cost)),
      pnl: round2(acc.pnl + (p.pnl ?? 0)),
    }),
    { cost: 0, value: 0, pnl: 0 },
  );

  return { account: toAccountView(account), positions, closed: closedViews, totals };
}

function toMarketRef(ref: SymbolMarketRef | undefined): MarketRefView | null {
  if (!ref) return null;
  return {
    betUuid: ref.betUuid,
    betTitle: ref.betTitle,
    betStatus: ref.betStatus,
    outcomeTitle: ref.outcomeTitle,
    side: ref.side,
  };
}

function toClosedView(
  c: ClosedPosition,
  refs: Map<string, SymbolMarketRef>,
): ClosedPositionView {
  return {
    id: c.id,
    symbol: c.symbol,
    side: c.side,
    volume: c.volume,
    openPrice: c.openPrice,
    openTime: c.openTime,
    closePrice: c.closePrice,
    closeTime: c.closeTime,
    profit: c.profit,
    netProfit: c.netProfit ?? c.profit,
    market: toMarketRef(refs.get(c.symbol)),
    // settlement closes come from a correction order at 0.00/1.00 — flag them
    // by settlement-shaped price, not by parsing free-text comments
    settled: c.closePrice === 0 || c.closePrice === 1,
  };
}

export type { OpenPosition };
