import { BrokerApiError } from "@/lib/broker/errors";
import type {
  AccountPositions,
  Bet,
  BetDetail,
  BetsPage,
  BrokerClient,
  CandlesResponse,
  ClosedPosition,
  CreateTradingAccountRequest,
  Outcome,
  Quote,
  SymbolInfo,
  TradeAck,
  TradingAccount,
  UserAccount,
} from "@/lib/broker/types";

type Query = Record<string, string | number | boolean | undefined>;

/**
 * Thin typed client over the Broker API v2 REST surface.
 * Every request carries `Authorization: Bearer <token>`; errors are parsed
 * into BrokerApiError ({status, title, detail, type}).
 */
export class HttpBrokerClient implements BrokerClient {
  readonly mode = "live" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });

    if (!res.ok) {
      let parsed: Record<string, unknown> | null = null;
      const text = await res.text().catch(() => "");
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // HTML/plain body → blocked before the API (proxy/WAF) or non-JSON error.
      }
      throw new BrokerApiError({
        status: res.status,
        title: typeof parsed?.title === "string" ? parsed.title : res.statusText,
        detail:
          typeof parsed?.detail === "string"
            ? parsed.detail
            : parsed
              ? text.slice(0, 300)
              : `Non-JSON response (${res.status}); the request may have been blocked before reaching the Broker API.`,
        type: typeof parsed?.type === "string" ? parsed.type : undefined,
        path,
      });
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ── Prediction market ───────────────────────────────────────────────────────

  getBets(params: { page?: number; size?: number; status?: string } = {}): Promise<BetsPage> {
    return this.request<BetsPage>("GET", "/v1/bets", {
      query: { page: params.page ?? 0, size: params.size ?? 100, status: params.status },
    });
  }

  /** Fetch all bets (bounded), following the {items,total,page,size} envelope. */
  async getAllBets(status?: string, maxItems = 400): Promise<Bet[]> {
    const pageSize = 100;
    const items: Bet[] = [];
    for (let page = 0; items.length < maxItems; page++) {
      const res = await this.getBets({ page, size: pageSize, status });
      items.push(...(res.items ?? []));
      if (!res.items?.length || items.length >= res.total) break;
    }
    return items.slice(0, maxItems);
  }

  getBet(uuid: string): Promise<BetDetail> {
    return this.request<BetDetail>("GET", `/v1/bets/${encodeURIComponent(uuid)}`);
  }

  getBetOutcomes(uuid: string): Promise<Outcome[]> {
    return this.request<Outcome[]>("GET", `/v1/bets/${encodeURIComponent(uuid)}/outcomes`);
  }

  // ── Instruments & prices ────────────────────────────────────────────────────

  getSymbols(group: string, symbols?: string[]): Promise<SymbolInfo[]> {
    return this.request<SymbolInfo[]>("GET", "/v1/symbols", {
      query: { group, symbols: symbols?.length ? symbols.join(",") : undefined },
    });
  }

  getCandles(params: {
    symbol: string;
    interval: string;
    from?: string;
    to?: string;
    size?: number;
  }): Promise<CandlesResponse> {
    return this.request<CandlesResponse>("GET", "/v1/candles", {
      query: {
        symbol: params.symbol,
        interval: params.interval,
        from: params.from,
        to: params.to,
        size: params.size,
      },
    });
  }

  /**
   * REST fallback for latest prices: freshest recent M1 candle close per symbol.
   * (The real-time path is the gRPC quote stream — see quotes.ts.)
   *
   * The window is kept well under the 1000-candle `size` cap so the server can
   * never truncate and drop the most-recent bar; and we pick the candle by
   * latest timestamp rather than assuming array order, so a stale bar can't be
   * mistaken for the current price.
   */
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const now = Date.now();
    const WINDOW_MINUTES = 360; // 6h of M1 candles, << 1000 cap → no truncation
    const from = new Date(now - WINDOW_MINUTES * 60 * 1000).toISOString();
    const to = new Date(now).toISOString();
    const out: Quote[] = [];
    const CONCURRENCY = 4;
    const queue = [...new Set(symbols)];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let s = queue.shift(); s !== undefined; s = queue.shift()) {
        try {
          const res = await this.getCandles({
            symbol: s,
            interval: "M1",
            from,
            to,
            size: WINDOW_MINUTES,
          });
          let last: { time: string; close: number } | undefined;
          for (const c of res.candles ?? []) {
            if (!last || Date.parse(c.time) >= Date.parse(last.time)) last = c;
          }
          if (last) {
            // ts is our fetch time (drives the REST cache TTL in quotes.ts); the
            // window above guarantees `last` is a genuinely recent bar.
            out.push({ symbol: s, bid: last.close, ask: last.close, ts: now, source: "rest" });
          }
        } catch {
          // no candles / unknown symbol — skip; caller treats the quote as unavailable
        }
      }
    });
    await Promise.all(workers);
    return out;
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    try {
      return await this.request<UserAccount>(
        "GET",
        `/v1/user-accounts/email/${encodeURIComponent(email)}`,
      );
    } catch (e) {
      if (e instanceof BrokerApiError && (e.isNotFound || e.status === 400)) return null;
      throw e;
    }
  }

  createUserAccount(email: string, password: string): Promise<UserAccount> {
    return this.request<UserAccount>("POST", "/v1/user-accounts", {
      body: { email, password },
    });
  }

  createTradingAccount(
    userUuid: string,
    req: CreateTradingAccountRequest,
  ): Promise<TradingAccount> {
    return this.request<TradingAccount>(
      "POST",
      `/v1/user-accounts/${encodeURIComponent(userUuid)}/trading-accounts`,
      { body: req },
    );
  }

  getTradingAccount(login: string): Promise<TradingAccount> {
    return this.request<TradingAccount>(
      "GET",
      `/v1/trading-accounts/${encodeURIComponent(login)}`,
    );
  }

  /** ⚠️ Non-idempotent — never blind-retry (see balance-operations reference). */
  deposit(login: string, amount: number): Promise<void> {
    return this.request<void>(
      "POST",
      `/v1/trading-accounts/${encodeURIComponent(login)}/deposit`,
      { body: { amount } },
    );
  }

  // ── Trading ─────────────────────────────────────────────────────────────────

  openPosition(req: {
    login: string;
    symbol: string;
    orderSide: "BUY" | "SELL";
    volume: number;
    comment?: string;
  }): Promise<TradeAck> {
    return this.request<TradeAck>("POST", "/v1/trading-accounts/positions/open", {
      body: req,
    });
  }

  closePositions(
    login: string,
    positions: { positionId: string; comment?: string }[],
  ): Promise<TradeAck> {
    return this.request<TradeAck>("POST", "/v1/trading-accounts/positions/close", {
      body: { login, closePositions: positions },
    });
  }

  closePartially(req: {
    login: string;
    positionId: string;
    volume: number;
    comment?: string;
  }): Promise<TradeAck> {
    return this.request<TradeAck>("POST", "/v1/trading-accounts/positions/close-partially", {
      body: req,
    });
  }

  // ── Trading data ────────────────────────────────────────────────────────────

  getOpenPositions(login: string): Promise<AccountPositions[]> {
    return this.request<AccountPositions[]>(
      "POST",
      "/v1/trading-accounts/trading-data/open-positions",
      { body: { logins: [login] } },
    );
  }

  async getClosedPositions(login: string, from: string, to: string): Promise<ClosedPosition[]> {
    // Response items carry no `login`, so always query a single login per call.
    const res = await this.request<{ closedPositions: ClosedPosition[] }>(
      "POST",
      "/v1/trading-accounts/trading-data/closed-positions",
      { body: { logins: [login], from, to } },
    );
    return res.closedPositions ?? [];
  }
}
