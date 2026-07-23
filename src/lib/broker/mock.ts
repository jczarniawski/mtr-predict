import { BrokerApiError } from "@/lib/broker/errors";
import { clampVolume, round2 } from "@/lib/money";
import type {
  AccountPositions,
  Bet,
  BetDetail,
  BetsPage,
  BrokerClient,
  Candle,
  CandlesResponse,
  ClosedPosition,
  CreateTradingAccountRequest,
  OpenPosition,
  OrderSide,
  Outcome,
  Quote,
  SymbolInfo,
  TradeAck,
  TradingAccount,
  UserAccount,
} from "@/lib/broker/types";

/**
 * In-memory simulation of the Broker API v2 surface this app uses, so the site
 * is fully browsable and tradable without a real token (BROKER_MODE=mock).
 * Prices follow a deterministic per-symbol random walk in 0..1; trading uses
 * the same margin/P&L semantics as the real platform (margin = cost basis at
 * 1:1 leverage, balance realizes P&L on close).
 */

const SPREAD = 0.01; // 1¢ book spread on every PRED instrument
const TICK_MS = 5_000;
const SIGMA_PER_TICK = 0.0005;
const MIN_MID = 0.02;
const MAX_MID = 0.98;
const MOCK_GROUP = "predUSD";

interface SeedOutcome {
  title: string;
  ticker: string;
  mid: number;
  result?: boolean;
}

interface SeedBet {
  uuid: string;
  title: string;
  subtitle: string;
  category: string;
  type: "BINARY" | "MULTI_CHOICE";
  status: "ACTIVE" | "RESOLVED";
  created: string;
  closeDate: string;
  resolvedDate?: string;
  outcomes: SeedOutcome[];
}

const SEED_BETS: SeedBet[] = [
  {
    uuid: "b1000000-0000-4000-8000-000000000001",
    title: "Will the Fed cut rates at the September 2026 meeting?",
    subtitle:
      "Resolves YES if the FOMC lowers the target federal funds rate at its scheduled September 2026 meeting.",
    category: "Economics",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-05-02T09:00:00Z",
    closeDate: "2026-09-16T18:00:00Z",
    outcomes: [{ title: "Yes", ticker: "FED-26SEP-CUT", mid: 0.62 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000002",
    title: "Who wins the 2026 FIFA World Cup?",
    subtitle: "Resolves to the national team that wins the 2026 FIFA World Cup final.",
    category: "Sports",
    type: "MULTI_CHOICE",
    status: "ACTIVE",
    created: "2026-04-20T12:00:00Z",
    closeDate: "2026-07-19T20:00:00Z",
    outcomes: [
      { title: "Spain", ticker: "WC26-ESP", mid: 0.22 },
      { title: "France", ticker: "WC26-FRA", mid: 0.18 },
      { title: "Argentina", ticker: "WC26-ARG", mid: 0.16 },
      { title: "Brazil", ticker: "WC26-BRA", mid: 0.14 },
      { title: "England", ticker: "WC26-ENG", mid: 0.12 },
      { title: "Any other team", ticker: "WC26-FIELD", mid: 0.18 },
    ],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000003",
    title: "Will Bitcoin trade above $150,000 by Dec 31, 2026?",
    subtitle:
      "Resolves YES if BTC/USD prints at or above $150,000 on any major exchange before 2027.",
    category: "Crypto",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-01-05T00:00:00Z",
    closeDate: "2026-12-31T23:59:00Z",
    outcomes: [{ title: "Yes", ticker: "BTC-150K-26", mid: 0.34 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000004",
    title: "Will Ethereum trade above $10,000 by Dec 31, 2026?",
    subtitle:
      "Resolves YES if ETH/USD prints at or above $10,000 on any major exchange before 2027.",
    category: "Crypto",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-01-05T00:00:00Z",
    closeDate: "2026-12-31T23:59:00Z",
    outcomes: [{ title: "Yes", ticker: "ETH-10K-26", mid: 0.21 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000005",
    title: "Which party wins the 2028 US presidential election?",
    subtitle: "Resolves to the party of the candidate who wins the 2028 US presidential election.",
    category: "Politics",
    type: "MULTI_CHOICE",
    status: "ACTIVE",
    created: "2026-02-01T00:00:00Z",
    closeDate: "2028-11-07T23:59:00Z",
    outcomes: [
      { title: "Democratic", ticker: "PRES28-DEM", mid: 0.52 },
      { title: "Republican", ticker: "PRES28-REP", mid: 0.45 },
      { title: "Other", ticker: "PRES28-OTH", mid: 0.03 },
    ],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000006",
    title: "US recession declared before 2027?",
    subtitle:
      "Resolves YES if the NBER declares a US recession with a start date before Jan 1, 2027.",
    category: "Economics",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-03-11T00:00:00Z",
    closeDate: "2026-12-31T23:59:00Z",
    outcomes: [{ title: "Yes", ticker: "REC-26", mid: 0.18 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000007",
    title: "Will an AI system win gold at the 2026 International Math Olympiad?",
    subtitle:
      "Resolves YES if any AI lab announces a system achieving a gold-medal score on the IMO 2026 problem set under contest conditions.",
    category: "Tech & Science",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-04-01T00:00:00Z",
    closeDate: "2026-08-01T00:00:00Z",
    outcomes: [{ title: "Yes", ticker: "AI-IMO-26", mid: 0.87 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000008",
    title: "UEFA Champions League winner 2026/27",
    subtitle: "Resolves to the club lifting the 2026/27 UEFA Champions League trophy.",
    category: "Sports",
    type: "MULTI_CHOICE",
    status: "ACTIVE",
    created: "2026-06-15T00:00:00Z",
    closeDate: "2027-06-05T20:00:00Z",
    outcomes: [
      { title: "Real Madrid", ticker: "UCL27-RMA", mid: 0.2 },
      { title: "Manchester City", ticker: "UCL27-MCI", mid: 0.17 },
      { title: "Arsenal", ticker: "UCL27-ARS", mid: 0.14 },
      { title: "Bayern Munich", ticker: "UCL27-BAY", mid: 0.12 },
      { title: "Paris Saint-Germain", ticker: "UCL27-PSG", mid: 0.11 },
      { title: "Any other club", ticker: "UCL27-FIELD", mid: 0.26 },
    ],
  },
  {
    uuid: "b1000000-0000-4000-8000-000000000009",
    title: "Will US CPI (YoY) exceed 3.0% in December 2026?",
    subtitle:
      "Resolves YES if the BLS-reported CPI-U year-over-year change for December 2026 is above 3.0%.",
    category: "Economics",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-02-14T00:00:00Z",
    closeDate: "2027-01-13T13:30:00Z",
    outcomes: [{ title: "Yes", ticker: "CPI-DEC26-3", mid: 0.41 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-00000000000a",
    title: "Crewed Starship flight before 2027?",
    subtitle: "Resolves YES if SpaceX launches a Starship flight with crew aboard before Jan 1, 2027.",
    category: "Tech & Science",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-01-20T00:00:00Z",
    closeDate: "2026-12-31T23:59:00Z",
    outcomes: [{ title: "Yes", ticker: "STARSHIP-CREW-26", mid: 0.27 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-00000000000b",
    title: "US government shutdown before March 2027?",
    subtitle:
      "Resolves YES if federal appropriations lapse causing a shutdown at any point before March 1, 2027.",
    category: "Politics",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-06-01T00:00:00Z",
    closeDate: "2027-03-01T05:00:00Z",
    outcomes: [{ title: "Yes", ticker: "SHUTDOWN-27MAR", mid: 0.33 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-00000000000c",
    title: "When will Dogecoin hit $1?",
    subtitle: "Resolves to the period in which DOGE/USD first prints at or above $1.00.",
    category: "Crypto",
    type: "MULTI_CHOICE",
    status: "ACTIVE",
    created: "2026-05-19T09:28:35Z",
    closeDate: "2030-01-01T00:00:00Z",
    outcomes: [
      { title: "In 2026", ticker: "DOGE1-2026", mid: 0.09 },
      { title: "In 2027", ticker: "DOGE1-2027", mid: 0.14 },
      { title: "2028 or later", ticker: "DOGE1-2028P", mid: 0.29 },
      { title: "Never (by 2030)", ticker: "DOGE1-NEVER", mid: 0.48 },
    ],
  },
  {
    uuid: "b1000000-0000-4000-8000-00000000000d",
    title: "Will 2026 be the hottest year on record?",
    subtitle:
      "Resolves YES if NASA GISS ranks 2026 as the warmest calendar year in its global temperature record.",
    category: "Climate",
    type: "BINARY",
    status: "ACTIVE",
    created: "2026-01-10T00:00:00Z",
    closeDate: "2027-01-20T00:00:00Z",
    outcomes: [{ title: "Yes", ticker: "HOT-2026", mid: 0.56 }],
  },
  {
    uuid: "b1000000-0000-4000-8000-00000000000e",
    title: "Eurovision 2026 winner",
    subtitle: "Resolved: Sweden won the Eurovision Song Contest 2026 grand final in Vienna.",
    category: "Entertainment",
    type: "MULTI_CHOICE",
    status: "RESOLVED",
    created: "2026-02-01T00:00:00Z",
    closeDate: "2026-05-16T19:00:00Z",
    resolvedDate: "2026-05-16T23:45:00Z",
    outcomes: [
      { title: "Sweden", ticker: "ESC26-SWE", mid: 1, result: true },
      { title: "Ukraine", ticker: "ESC26-UKR", mid: 0, result: false },
      { title: "France", ticker: "ESC26-FRA", mid: 0, result: false },
      { title: "Any other country", ticker: "ESC26-FIELD", mid: 0, result: false },
    ],
  },
];

// ── deterministic pseudo-randomness ──────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ~N(0,1) noise for (symbol, tick), stable across processes. */
function noiseAt(symbol: string, tick: number): number {
  const rnd = mulberry32(hashStr(symbol) ^ (tick * 2654435761));
  return (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3);
}

// ── store ────────────────────────────────────────────────────────────────────

interface OutcomeState {
  yesSymbol: string;
  mid: number;
  lastTick: number;
  dayKey: string;
  dayOpenMid: number;
  /** recorded (ts, mid) samples since boot, ~1 per tick */
  samples: { ts: number; mid: number }[];
  initialMid: number;
  frozen: boolean; // resolved bets don't move
}

interface InstrumentRef {
  isYes: boolean;
  bet: SeedBet;
  outcome: Outcome;
  yesSymbol: string;
}

interface MockAccount {
  user: UserAccount & { password: string };
  account: Omit<TradingAccount, "financeInfo">;
  balance: number;
  positions: Map<string, OpenPosition & { margin: number }>;
  closed: ClosedPosition[];
}

interface MockStore {
  bootTs: number;
  bets: SeedBet[];
  outcomes: Map<string, Outcome[]>; // bet uuid → outcomes
  instruments: Map<string, InstrumentRef>;
  state: Map<string, OutcomeState>; // yes-symbol → price state
  usersByEmail: Map<string, UserAccount & { password: string }>;
  accounts: Map<string, MockAccount>; // login → account
  loginSeq: number;
  posSeq: number;
}

function dayKeyOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function buildStore(): MockStore {
  const store: MockStore = {
    bootTs: Date.now(),
    bets: SEED_BETS,
    outcomes: new Map(),
    instruments: new Map(),
    state: new Map(),
    usersByEmail: new Map(),
    accounts: new Map(),
    loginSeq: 820001,
    posSeq: 1,
  };

  for (const bet of SEED_BETS) {
    const resolved = bet.status === "RESOLVED";
    const outcomes: Outcome[] = bet.outcomes.map((seed) => ({
      title: seed.title,
      externalId: seed.ticker,
      instrumentYesName: `${seed.ticker}-YES`,
      instrumentNoName: `${seed.ticker}-NO`,
      status: resolved ? "RESOLVED" : "ACTIVE",
      result: resolved ? (seed.result ?? false) : null,
      resolvedDate: resolved ? (bet.resolvedDate ?? null) : null,
      expectedCloseTime: bet.closeDate,
    }));
    store.outcomes.set(bet.uuid, outcomes);

    outcomes.forEach((outcome, i) => {
      const seed = bet.outcomes[i];
      const yesSymbol = outcome.instrumentYesName;
      store.instruments.set(outcome.instrumentYesName, {
        isYes: true,
        bet,
        outcome,
        yesSymbol,
      });
      store.instruments.set(outcome.instrumentNoName, {
        isYes: false,
        bet,
        outcome,
        yesSymbol,
      });
      const now = Date.now();
      store.state.set(yesSymbol, {
        yesSymbol,
        mid: seed.mid,
        lastTick: Math.floor(now / TICK_MS),
        dayKey: dayKeyOf(now),
        dayOpenMid: seed.mid,
        samples: [{ ts: now, mid: seed.mid }],
        initialMid: seed.mid,
        frozen: resolved,
      });
    });
  }

  seedDemoAccount(store);
  return store;
}

function seedDemoAccount(store: MockStore) {
  const email = "demo@mtr-predict.local";
  const user: UserAccount & { password: string } = {
    uuid: "u1000000-0000-4000-8000-000000000001",
    email,
    created: new Date(store.bootTs - 14 * 86_400_000).toISOString(),
    brokerId: 0,
    password: "Demo1234",
  };
  store.usersByEmail.set(email, user);

  const login = "820000";
  const acct: MockAccount = {
    user,
    account: {
      uuid: "t1000000-0000-4000-8000-000000000001",
      created: user.created,
      login,
      group: MOCK_GROUP,
      leverageRatioPercent: 100,
      accessRight: "FULL",
      accountType: "DEMO",
      accountDetails: { firstName: "Demo", lastName: "Trader" },
      version: 1,
    },
    balance: 10_000,
    positions: new Map(),
    closed: [],
  };

  const seedPos = (symbol: string, volume: number, openPrice: number, daysAgo: number) => {
    const id = `M${String(store.posSeq++).padStart(10, "0")}`;
    acct.positions.set(id, {
      id,
      symbol,
      alias: symbol,
      volume,
      side: "BUY",
      openTime: new Date(store.bootTs - daysAgo * 86_400_000).toISOString(),
      openPrice,
      commission: 0,
      swap: 0,
      comment: "seeded demo position",
      margin: round2(volume * openPrice),
    });
  };
  seedPos("FED-26SEP-CUT-YES", 100, 0.55, 6);
  seedPos("BTC-150K-26-YES", 50, 0.4, 3);

  acct.closed.push({
    id: `M${String(store.posSeq++).padStart(10, "0")}`,
    symbol: "ESC26-SWE-YES",
    alias: "ESC26-SWE-YES",
    volume: 40,
    side: "BUY",
    openTime: new Date(store.bootTs - 70 * 86_400_000).toISOString(),
    openPrice: 0.31,
    closeTime: "2026-05-16T23:45:00Z",
    closePrice: 1,
    commission: 0,
    swap: 0,
    profit: round2(40 * (1 - 0.31)),
    netProfit: round2(40 * (1 - 0.31)),
    reason: "CLOSE_REASON_CORRECTION",
    comment: "Prediction Market settled",
  });

  store.accounts.set(login, acct);
}

declare global {
  // eslint-disable-next-line no-var
  var __mtrPredictMockStore: MockStore | undefined;
}

function getStore(): MockStore {
  return (globalThis.__mtrPredictMockStore ??= buildStore());
}

/** Test hook: rebuild the store from seeds. */
export function resetMockStore(): void {
  globalThis.__mtrPredictMockStore = buildStore();
}

// ── price engine ─────────────────────────────────────────────────────────────

function advance(state: OutcomeState, now: number): void {
  if (state.frozen) return;
  const currentTick = Math.floor(now / TICK_MS);
  if (currentTick > state.lastTick) {
    let steps = currentTick - state.lastTick;
    if (steps > 2000) {
      // long idle: one sqrt-scaled jump instead of replaying every tick
      const jump = SIGMA_PER_TICK * Math.sqrt(steps) * noiseAt(state.yesSymbol, currentTick);
      state.mid = clampMid(state.mid + jump);
      steps = 0;
    }
    for (let t = state.lastTick + 1; t <= state.lastTick + steps; t++) {
      state.mid = clampMid(state.mid + SIGMA_PER_TICK * noiseAt(state.yesSymbol, t));
    }
    state.lastTick = currentTick;
    const last = state.samples[state.samples.length - 1];
    if (!last || now - last.ts >= TICK_MS) {
      state.samples.push({ ts: now, mid: state.mid });
      if (state.samples.length > 5000) state.samples.splice(0, state.samples.length - 5000);
    }
  }
  const dayKey = dayKeyOf(now);
  if (dayKey !== state.dayKey) {
    state.dayKey = dayKey;
    state.dayOpenMid = state.mid;
  }
}

function clampMid(m: number): number {
  return Math.min(MAX_MID, Math.max(MIN_MID, m));
}

function quoteFor(store: MockStore, symbol: string, now: number): Quote | null {
  const ref = store.instruments.get(symbol);
  if (!ref) return null;
  const state = store.state.get(ref.yesSymbol)!;
  advance(state, now);
  const yesMid = state.mid;
  const midPrice = ref.isYes ? yesMid : 1 - yesMid;
  // Settled instruments have no book — quote exactly at the settlement price.
  const half = state.frozen ? 0 : SPREAD / 2;
  const bid = Math.max(0, round4(midPrice - half));
  const ask = Math.min(1, round4(midPrice + half));
  const dayChange = ref.isYes ? yesMid - state.dayOpenMid : -(yesMid - state.dayOpenMid);
  return { symbol, bid, ask, ts: now, dailyChange: round4(dayChange), source: "mock" };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

const INTERVAL_MS: Record<string, number> = {
  M1: 60_000,
  M5: 300_000,
  M15: 900_000,
  M30: 1_800_000,
  H1: 3_600_000,
  H4: 14_400_000,
  D1: 86_400_000,
};

/**
 * Candles: deterministic seeded walk for buckets before boot (anchored so the
 * pre-history ends at the outcome's initial mid), recorded samples after boot.
 */
function candlesFor(
  store: MockStore,
  symbol: string,
  interval: string,
  size: number,
  now: number,
): Candle[] {
  const ref = store.instruments.get(symbol);
  const step = INTERVAL_MS[interval];
  if (!ref || !step) return [];
  const state = store.state.get(ref.yesSymbol)!;
  advance(state, now);

  const lastBucket = Math.floor(now / step);
  const bootBucket = Math.floor(store.bootTs / step);
  const firstBucket = lastBucket - size + 1;

  // Pre-history mids for the yes-instrument, walking backwards from initialMid.
  const preMids = new Map<number, number>();
  if (firstBucket <= bootBucket) {
    let m = state.initialMid;
    const sigma = SIGMA_PER_TICK * Math.sqrt(step / TICK_MS);
    for (let b = bootBucket; b >= firstBucket; b--) {
      preMids.set(b, m);
      m = clampMid(m - sigma * noiseAt(`${ref.yesSymbol}|${interval}`, b));
    }
  }

  const candles: Candle[] = [];
  // Carried in YES space (like `samples`/`preMids`); mapped to the requested
  // instrument's space only when emitting. Carrying it in instrument space was
  // the NO-side bug: an empty bucket's fallback got re-mapped a second time.
  let prevYesClose: number | null = null;
  const anchorYes = state.samples[0]?.mid ?? state.initialMid;
  for (let b = firstBucket; b <= lastBucket; b++) {
    let yesMids: number[] = [];
    if (b <= bootBucket) {
      const m = preMids.get(b);
      if (m !== undefined) yesMids = [m];
    } else {
      const from = b * step;
      const to = from + step;
      yesMids = state.samples.filter((s) => s.ts >= from && s.ts < to).map((s) => s.mid);
      if (b === lastBucket) yesMids.push(state.mid);
    }
    if (!yesMids.length) {
      // Empty bucket: hold the last close (or the anchor for leading buckets
      // when uptime < window, so they render flat instead of being dropped).
      yesMids = [prevYesClose ?? anchorYes];
    }
    const vals = ref.isYes ? yesMids : yesMids.map((m) => 1 - m);
    const openYes = prevYesClose ?? yesMids[0];
    const open = ref.isYes ? openYes : 1 - openYes;
    const close = vals[vals.length - 1];
    candles.push({
      time: new Date(b * step).toISOString(),
      open: round4(open),
      high: round4(Math.max(open, ...vals)),
      low: round4(Math.min(open, ...vals)),
      close: round4(close),
    });
    prevYesClose = yesMids[yesMids.length - 1];
  }
  return candles;
}

// ── finance helpers ──────────────────────────────────────────────────────────

function positionQuote(store: MockStore, pos: OpenPosition, now: number): number | null {
  const q = quoteFor(store, pos.symbol, now);
  if (!q) return null;
  return pos.side === "BUY" ? q.bid : q.ask;
}

function positionProfit(pos: OpenPosition, current: number): number {
  const diff = pos.side === "BUY" ? current - pos.openPrice : pos.openPrice - current;
  return round2(diff * pos.volume);
}

function financeInfoOf(store: MockStore, acct: MockAccount, now: number) {
  let profit = 0;
  let margin = 0;
  for (const pos of acct.positions.values()) {
    const current = positionQuote(store, pos, now) ?? pos.openPrice;
    profit += positionProfit(pos, current);
    margin += pos.margin;
  }
  profit = round2(profit);
  margin = round2(margin);
  const equity = round2(acct.balance + profit);
  return {
    balance: round2(acct.balance),
    equity,
    profit,
    netProfit: profit,
    margin,
    freeMargin: round2(equity - margin),
    marginLevel: margin > 0 ? round2((equity / margin) * 100) : 0,
    credit: 0,
    currency: "USD",
    currencyPrecision: 2,
  };
}

const PRED_SYMBOL_DEFAULTS = {
  pricePrecision: 4,
  volumePrecision: 0,
  volumeMin: 1,
  volumeMax: 25_000,
  volumeStep: 1,
  contractSize: 1,
};

// ── the client ───────────────────────────────────────────────────────────────

export class MockBrokerClient implements BrokerClient {
  readonly mode = "mock" as const;

  private get store(): MockStore {
    return getStore();
  }

  // Prediction market

  async getBets(
    params: { page?: number; size?: number; status?: string } = {},
  ): Promise<BetsPage> {
    const { page = 0, size = 100, status } = params;
    const all = this.store.bets
      .filter((b) => !status || b.status === status)
      .map(toBet)
      .sort((a, b) => (a.created < b.created ? 1 : -1));
    const start = page * size;
    return { items: all.slice(start, start + size), total: all.length, page, size };
  }

  async getBet(uuid: string): Promise<BetDetail> {
    const bet = this.store.bets.find((b) => b.uuid === uuid);
    if (!bet) throw notFound(`Bet ${uuid} not found.`, `/v1/bets/${uuid}`);
    return toBetDetail(bet);
  }

  async getBetOutcomes(uuid: string): Promise<Outcome[]> {
    const outcomes = this.store.outcomes.get(uuid);
    if (!outcomes) throw notFound(`Bet ${uuid} not found.`, `/v1/bets/${uuid}/outcomes`);
    return outcomes.map((o) => ({ ...o }));
  }

  // Instruments & prices

  async getSymbols(_group: string, symbols?: string[]): Promise<SymbolInfo[]> {
    const names = symbols?.length ? symbols : [...this.store.instruments.keys()];
    const out: SymbolInfo[] = [];
    for (const name of names) {
      const ref = this.store.instruments.get(name);
      if (!ref) continue;
      out.push({
        symbol: name,
        alias: name,
        type: "PRED",
        description: `${ref.bet.title} — ${ref.outcome.title} (${ref.isYes ? "YES" : "NO"})`,
        sessionOpen: ref.bet.status === "ACTIVE",
        ...PRED_SYMBOL_DEFAULTS,
      });
    }
    return out;
  }

  async getCandles(params: {
    symbol: string;
    interval: string;
    from?: string;
    to?: string;
    size?: number;
  }): Promise<CandlesResponse> {
    const size = Math.min(Math.max(params.size ?? 500, 1), 1000);
    return {
      symbol: params.symbol,
      interval: params.interval,
      candles: candlesFor(this.store, params.symbol, params.interval, size, Date.now()),
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const now = Date.now();
    const out: Quote[] = [];
    for (const s of new Set(symbols)) {
      const q = quoteFor(this.store, s, now);
      if (q) out.push(q);
    }
    return out;
  }

  // Accounts

  async getUserByEmail(email: string): Promise<UserAccount | null> {
    const u = this.store.usersByEmail.get(email.toLowerCase());
    return u ? { uuid: u.uuid, email: u.email, created: u.created, brokerId: 0 } : null;
  }

  async createUserAccount(email: string, password: string): Promise<UserAccount> {
    const key = email.toLowerCase();
    if (this.store.usersByEmail.has(key)) {
      throw new BrokerApiError({
        status: 409,
        title: "User account already exists.",
        detail: "User account already exists.",
        type: "error://broker-api/user-account/already-exists",
        path: "/v1/user-accounts",
      });
    }
    const user = {
      uuid: cryptoRandomUuid(),
      email: key,
      created: new Date().toISOString(),
      brokerId: 0,
      password,
    };
    this.store.usersByEmail.set(key, user);
    return { uuid: user.uuid, email: user.email, created: user.created, brokerId: 0 };
  }

  async createTradingAccount(
    userUuid: string,
    req: CreateTradingAccountRequest,
  ): Promise<TradingAccount> {
    const user = [...this.store.usersByEmail.values()].find((u) => u.uuid === userUuid);
    if (!user) throw notFound("User account not found.", "/v1/user-accounts");
    const login = String(this.store.loginSeq++);
    const acct: MockAccount = {
      user,
      account: {
        uuid: cryptoRandomUuid(),
        created: new Date().toISOString(),
        login,
        group: req.group || MOCK_GROUP,
        leverageRatioPercent: req.leverageRatioPercent,
        accessRight: req.accessRight ?? "FULL",
        accountType: req.accountType,
        accountDetails: req.accountDetails,
        version: 1,
      },
      balance: req.initialDeposit ?? 0,
      positions: new Map(),
      closed: [],
    };
    this.store.accounts.set(login, acct);
    return { ...acct.account, financeInfo: financeInfoOf(this.store, acct, Date.now()) };
  }

  async getTradingAccount(login: string): Promise<TradingAccount> {
    const acct = this.store.accounts.get(login);
    if (!acct) throw notFound(`Trading account ${login} not found.`, `/v1/trading-accounts/${login}`);
    return { ...acct.account, financeInfo: financeInfoOf(this.store, acct, Date.now()) };
  }

  async deposit(login: string, amount: number): Promise<void> {
    const acct = this.store.accounts.get(login);
    if (!acct) throw notFound(`Trading account ${login} not found.`, `/v1/trading-accounts/${login}/deposit`);
    acct.balance = round2(acct.balance + amount);
  }

  // Trading

  async openPosition(req: {
    login: string;
    symbol: string;
    orderSide: OrderSide;
    volume: number;
    comment?: string;
  }): Promise<TradeAck> {
    const store = this.store;
    const acct = store.accounts.get(req.login);
    if (!acct) throw notFound(`Trading account ${req.login} not found.`, "/v1/trading-accounts/positions/open");
    const ref = store.instruments.get(req.symbol);
    if (!ref) throw badRequest(`Unknown symbol ${req.symbol}.`);
    if (ref.bet.status !== "ACTIVE") throw badRequest("Market is closed — this event has resolved.");
    const volume = clampVolume(req.volume, PRED_SYMBOL_DEFAULTS);
    if (volume <= 0) throw badRequest("Volume below the instrument minimum.");

    const now = Date.now();
    const q = quoteFor(store, req.symbol, now)!;
    const price = req.orderSide === "BUY" ? q.ask : q.bid;
    const margin = round2(req.orderSide === "BUY" ? volume * price : volume * (1 - price));
    const fin = financeInfoOf(store, acct, now);
    if (fin.freeMargin < margin) {
      throw badRequest(
        `Insufficient free margin: need $${margin.toFixed(2)}, available $${fin.freeMargin.toFixed(2)}.`,
      );
    }

    const id = `M${String(store.posSeq++).padStart(10, "0")}`;
    acct.positions.set(id, {
      id,
      symbol: req.symbol,
      alias: req.symbol,
      volume,
      side: req.orderSide,
      openTime: new Date(now).toISOString(),
      openPrice: price,
      commission: 0,
      swap: 0,
      comment: req.comment,
      margin,
    });
    return { status: "OK", orderId: id };
  }

  async closePositions(
    login: string,
    positions: { positionId: string; comment?: string }[],
  ): Promise<TradeAck> {
    const store = this.store;
    const acct = store.accounts.get(login);
    if (!acct) throw notFound(`Trading account ${login} not found.`, "/v1/trading-accounts/positions/close");
    const now = Date.now();
    const partialResponses = positions.map(({ positionId, comment }) => {
      const pos = acct.positions.get(positionId);
      if (!pos) return { positionId, errorMessage: "Position not found" };
      this.realizeClose(acct, pos, pos.volume, now, comment);
      return { positionId, errorMessage: "" };
    });
    return { status: "OK", partialResponses };
  }

  async closePartially(req: {
    login: string;
    positionId: string;
    volume: number;
    comment?: string;
  }): Promise<TradeAck> {
    const store = this.store;
    const acct = store.accounts.get(req.login);
    if (!acct) throw notFound(`Trading account ${req.login} not found.`, "/v1/trading-accounts/positions/close-partially");
    const pos = acct.positions.get(req.positionId);
    if (!pos) throw badRequest("Position not found.");
    const volume = clampVolume(req.volume, PRED_SYMBOL_DEFAULTS);
    if (volume <= 0 || volume > pos.volume) throw badRequest("Invalid volume to close.");
    this.realizeClose(acct, pos, volume, Date.now(), req.comment);
    return { status: "OK", orderId: pos.id };
  }

  private realizeClose(
    acct: MockAccount,
    pos: OpenPosition & { margin: number },
    volume: number,
    now: number,
    comment?: string,
  ): void {
    const store = this.store;
    const current = positionQuote(store, pos, now) ?? pos.openPrice;
    const closingPart = volume / pos.volume;
    const profit = positionProfit({ ...pos, volume }, current);
    acct.balance = round2(acct.balance + profit);
    acct.closed.push({
      id: pos.id,
      uid: `${pos.id}_${Date.now()}`,
      symbol: pos.symbol,
      alias: pos.alias,
      volume,
      side: pos.side,
      openTime: pos.openTime,
      openPrice: pos.openPrice,
      closeTime: new Date(now).toISOString(),
      closePrice: current,
      commission: 0,
      swap: 0,
      profit,
      netProfit: profit,
      closingOrderId: `M${String(store.posSeq++).padStart(10, "0")}`,
      reason: "CLOSE_REASON_USER",
      comment: comment ?? "closed via MTR Predict",
    });
    if (volume >= pos.volume) {
      acct.positions.delete(pos.id);
    } else {
      pos.volume = round2(pos.volume - volume);
      pos.margin = round2(pos.margin * (1 - closingPart));
    }
  }

  // Trading data

  async getOpenPositions(login: string): Promise<AccountPositions[]> {
    const acct = this.store.accounts.get(login);
    if (!acct) return [];
    const now = Date.now();
    const positions = [...acct.positions.values()].map((pos) => {
      const current = positionQuote(this.store, pos, now) ?? pos.openPrice;
      const { margin: _margin, ...rest } = pos;
      return {
        ...rest,
        currentPrice: current,
        profit: positionProfit(pos, current),
        netProfit: positionProfit(pos, current),
      };
    });
    return [{ login, group: acct.account.group, positions }];
  }

  async getClosedPositions(login: string, from: string, to: string): Promise<ClosedPosition[]> {
    const acct = this.store.accounts.get(login);
    if (!acct) return [];
    const fromTs = Date.parse(from);
    const toTs = Date.parse(to);
    return acct.closed
      .filter((c) => {
        const t = Date.parse(c.closeTime);
        return (!Number.isFinite(fromTs) || t >= fromTs) && (!Number.isFinite(toTs) || t <= toTs);
      })
      .sort((a, b) => (a.closeTime < b.closeTime ? 1 : -1));
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

function toBet(b: SeedBet): Bet {
  return {
    uuid: b.uuid,
    title: b.title,
    imageUrl: "",
    category: b.category,
    type: b.type,
    status: b.status,
    created: b.created,
  };
}

function toBetDetail(b: SeedBet): BetDetail {
  return {
    ...toBet(b),
    subtitle: b.subtitle,
    closeDate: b.closeDate,
    resolvedDate: b.resolvedDate ?? null,
  };
}

function notFound(detail: string, path: string): BrokerApiError {
  return new BrokerApiError({ status: 404, title: "Not found", detail, path });
}

function badRequest(detail: string): BrokerApiError {
  return new BrokerApiError({ status: 400, title: "Bad request", detail });
}

function cryptoRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}
