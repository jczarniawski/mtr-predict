import type { QuoteService } from "@/lib/quotes";
import type {
  Bet,
  BetDetail,
  BrokerClient,
  Outcome,
  Quote,
  SymbolInfo,
} from "@/lib/broker/types";
import { mid } from "@/lib/money";

const BETS_TTL_MS = 30_000;
const OUTCOMES_TTL_MS = 5 * 60_000;
const DETAIL_TTL_MS = 60_000;
const SYMBOLS_TTL_MS = 10 * 60_000;
const MAX_BETS = 300;
const OUTCOME_FETCH_CONCURRENCY = 6;

export interface PriceView {
  bid: number;
  ask: number;
  mid: number;
  ts: number;
}

export interface OutcomeView extends Outcome {
  yes: PriceView | null;
  no: PriceView | null;
  /** Convenience: implied probability (mid of the YES instrument), 0..1. */
  yesMid: number | null;
  /** Change of the YES mid since day open, when the feed provides it. */
  dailyChange: number | null;
}

export interface MarketSummary extends Bet {
  closeDate: string | null;
  outcomes: OutcomeView[];
  outcomesTotal: number;
}

export interface MarketDetailView extends BetDetail {
  outcomes: OutcomeView[];
}

export interface SymbolMarketRef {
  betUuid: string;
  betTitle: string;
  betStatus: string;
  betCategory: string;
  outcomeTitle: string;
  outcomeResult: boolean | null;
  side: "YES" | "NO";
}

interface Cached<T> {
  ts: number;
  value: T;
}

/**
 * Assembles Bets + Outcomes + Quotes into UI-ready market views, with
 * short-lived caches sized to stay far below the API's 500 req/min budget.
 */
export class MarketService {
  private betsCache: Cached<Bet[]> | null = null;
  private betsPromise: Promise<Bet[]> | null = null;
  private detailCache = new Map<string, Cached<BetDetail>>();
  private outcomesCache = new Map<string, Cached<Outcome[]>>();
  private symbolIndex = new Map<string, SymbolMarketRef>();
  private symbolInfoCache = new Map<string, Cached<SymbolInfo>>();

  constructor(
    private readonly broker: BrokerClient,
    private readonly quotes: QuoteService,
    private readonly group: string,
  ) {}

  /** All bets, every status, cached briefly. */
  async listBets(): Promise<Bet[]> {
    const now = Date.now();
    if (this.betsCache && now - this.betsCache.ts < BETS_TTL_MS) return this.betsCache.value;
    this.betsPromise ??= this.fetchAllBets().then((items) => {
      this.betsCache = { ts: Date.now(), value: items };
      this.betsPromise = null;
      return items;
    });
    try {
      return await this.betsPromise;
    } catch (e) {
      this.betsPromise = null;
      // keep serving the previous snapshot on transient upstream failures
      if (this.betsCache) return this.betsCache.value;
      throw e;
    }
  }

  private async fetchAllBets(): Promise<Bet[]> {
    const pageSize = 100;
    const items: Bet[] = [];
    for (let page = 0; items.length < MAX_BETS; page++) {
      const res = await this.broker.getBets({ page, size: pageSize });
      items.push(...(res.items ?? []));
      if (!res.items?.length || items.length >= res.total) break;
    }
    return items.slice(0, MAX_BETS);
  }

  async listCategories(): Promise<string[]> {
    const bets = await this.listBets();
    const counts = new Map<string, number>();
    for (const b of bets) {
      if (b.status !== "ACTIVE" || !b.category) continue;
      counts.set(b.category, (counts.get(b.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }

  async listMarkets(
    params: { status?: string; category?: string; q?: string; limit?: number } = {},
  ): Promise<MarketSummary[]> {
    const { status = "ACTIVE", category, q, limit = 60 } = params;
    let bets = await this.listBets();
    if (status) bets = bets.filter((b) => b.status === status);
    if (category) bets = bets.filter((b) => b.category === category);
    if (q) {
      const needle = q.trim().toLowerCase();
      bets = bets.filter((b) => b.title.toLowerCase().includes(needle));
    }
    bets = bets.slice(0, limit);

    const outcomesPerBet = await mapLimit(bets, OUTCOME_FETCH_CONCURRENCY, (b) =>
      this.getOutcomes(b.uuid).catch(() => [] as Outcome[]),
    );

    // Cards need YES prices everywhere + the NO side for binary markets.
    const symbols: string[] = [];
    bets.forEach((bet, i) => {
      for (const o of outcomesPerBet[i]) {
        symbols.push(o.instrumentYesName);
        if (outcomesPerBet[i].length === 1) symbols.push(o.instrumentNoName);
      }
    });
    const quoteMap = await this.quotes.getQuotes(symbols);

    return bets.map((bet, i) => {
      const views = outcomesPerBet[i]
        .map((o) => toOutcomeView(o, quoteMap))
        .sort(byYesMidDesc);
      return {
        ...bet,
        closeDate: views[0]?.expectedCloseTime ?? null,
        outcomes: views,
        outcomesTotal: views.length,
      };
    });
  }

  async getMarket(uuid: string): Promise<MarketDetailView> {
    const [detail, outcomes] = await Promise.all([
      this.getDetail(uuid),
      this.getOutcomes(uuid),
    ]);
    const symbols = outcomes.flatMap((o) => [o.instrumentYesName, o.instrumentNoName]);
    const quoteMap = await this.quotes.getQuotes(symbols);
    const views = outcomes.map((o) => toOutcomeView(o, quoteMap)).sort(byYesMidDesc);
    return { ...detail, outcomes: views };
  }

  private async getDetail(uuid: string): Promise<BetDetail> {
    const now = Date.now();
    const cached = this.detailCache.get(uuid);
    if (cached && now - cached.ts < DETAIL_TTL_MS) return cached.value;
    const detail = await this.broker.getBet(uuid);
    this.detailCache.set(uuid, { ts: now, value: detail });
    return detail;
  }

  async getOutcomes(betUuid: string): Promise<Outcome[]> {
    const now = Date.now();
    const cached = this.outcomesCache.get(betUuid);
    if (cached && now - cached.ts < OUTCOMES_TTL_MS) return cached.value;
    const outcomes = await this.broker.getBetOutcomes(betUuid);
    this.outcomesCache.set(betUuid, { ts: now, value: outcomes });
    void this.indexOutcomes(betUuid, outcomes);
    return outcomes;
  }

  private async indexOutcomes(betUuid: string, outcomes: Outcome[]): Promise<void> {
    let bet = this.betsCache?.value.find((b) => b.uuid === betUuid);
    if (!bet) bet = (await this.listBets().catch(() => [])).find((b) => b.uuid === betUuid);
    for (const o of outcomes) {
      const base = {
        betUuid,
        betTitle: bet?.title ?? betUuid,
        betStatus: bet?.status ?? "ACTIVE",
        betCategory: bet?.category ?? "",
        outcomeTitle: o.title,
        outcomeResult: o.result,
      };
      this.symbolIndex.set(o.instrumentYesName, { ...base, side: "YES" });
      this.symbolIndex.set(o.instrumentNoName, { ...base, side: "NO" });
    }
  }

  /**
   * Map instrument symbols (from positions) back to their bet/outcome.
   * Fetches outcome lists for not-yet-indexed bets until all symbols resolve.
   */
  async resolveSymbols(symbols: string[]): Promise<Map<string, SymbolMarketRef>> {
    const remaining = new Set(symbols.filter((s) => !this.symbolIndex.has(s)));
    if (remaining.size > 0) {
      const bets = await this.listBets().catch(() => [] as Bet[]);
      const unindexed = bets.filter((b) => !this.outcomesCache.has(b.uuid));
      for (let i = 0; i < unindexed.length && remaining.size > 0; i += OUTCOME_FETCH_CONCURRENCY) {
        const batch = unindexed.slice(i, i + OUTCOME_FETCH_CONCURRENCY);
        await Promise.all(batch.map((b) => this.getOutcomes(b.uuid).catch(() => [])));
        for (const s of [...remaining]) if (this.symbolIndex.has(s)) remaining.delete(s);
      }
    }
    const out = new Map<string, SymbolMarketRef>();
    for (const s of symbols) {
      const ref = this.symbolIndex.get(s);
      if (ref) out.set(s, ref);
    }
    return out;
  }

  /** Instrument config (volume bounds, contract size), cached per symbol. */
  async getSymbolInfos(symbols: string[], group = this.group): Promise<Map<string, SymbolInfo>> {
    const now = Date.now();
    const out = new Map<string, SymbolInfo>();
    const missing: string[] = [];
    for (const s of new Set(symbols)) {
      const cached = this.symbolInfoCache.get(s);
      if (cached && now - cached.ts < SYMBOLS_TTL_MS) out.set(s, cached.value);
      else missing.push(s);
    }
    if (missing.length > 0) {
      try {
        const infos = await this.broker.getSymbols(group, missing);
        for (const info of infos) {
          this.symbolInfoCache.set(info.symbol, { ts: now, value: info });
          out.set(info.symbol, info);
        }
      } catch (e) {
        console.warn(`[markets] getSymbols failed: ${(e as Error).message}`);
      }
    }
    return out;
  }
}

function toOutcomeView(o: Outcome, quotes: Record<string, Quote>): OutcomeView {
  const yesQ = quotes[o.instrumentYesName];
  const noQ = quotes[o.instrumentNoName];
  const yes = yesQ ? toPriceView(yesQ) : null;
  const no = noQ ? toPriceView(noQ) : null;
  // Resolved outcomes pin to their settlement price even without a live quote.
  let yesMid = yes?.mid ?? (no ? 1 - no.mid : null);
  if (yesMid == null && o.result != null) yesMid = o.result ? 1 : 0;
  return {
    ...o,
    yes,
    no: no ?? (yes ? synthesizeOpposite(yes) : null),
    yesMid,
    dailyChange: yesQ?.dailyChange ?? null,
  };
}

function toPriceView(q: Quote): PriceView {
  return { bid: q.bid, ask: q.ask, mid: mid(q.bid, q.ask), ts: q.ts };
}

/** When only one side has a quote, derive the other from 1 − price. */
function synthesizeOpposite(p: PriceView): PriceView {
  return { bid: Math.max(0, 1 - p.ask), ask: Math.min(1, 1 - p.bid), mid: 1 - p.mid, ts: p.ts };
}

function byYesMidDesc(a: OutcomeView, b: OutcomeView): number {
  return (b.yesMid ?? -1) - (a.yesMid ?? -1);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
