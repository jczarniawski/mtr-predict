// Domain types mirroring the Match-Trader Broker API v2 payloads
// (field names follow the API docs; see references in the repo README).

export type BetType = "BINARY" | "MULTI_CHOICE" | (string & {});
export type BetStatus = "ACTIVE" | "RESOLVED" | (string & {});
export type OrderSide = "BUY" | "SELL";

/** Item of GET /v1/bets (list items carry no description/subtitle). */
export interface Bet {
  uuid: string;
  title: string;
  imageUrl: string;
  category: string;
  type: BetType;
  status: BetStatus;
  created: string;
}

/** GET /v1/bets/{uuid} additionally returns these. */
export interface BetDetail extends Bet {
  subtitle?: string | null;
  closeDate?: string | null;
  resolvedDate?: string | null;
}

export interface BetsPage {
  items: Bet[];
  total: number;
  page: number;
  size: number;
}

/** Item of GET /v1/bets/{uuid}/outcomes. */
export interface Outcome {
  title: string;
  externalId: string;
  instrumentYesName: string;
  instrumentNoName: string;
  status: string;
  /** true = YES won; null while unresolved. */
  result: boolean | null;
  resolvedDate: string | null;
  expectedCloseTime: string | null;
}

/** Subset of GET /v1/symbols we rely on. */
export interface SymbolInfo {
  symbol: string;
  alias?: string;
  type?: string; // FOREX | CFD | FOREXCFD | PRED
  description?: string;
  pricePrecision: number;
  volumePrecision: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  contractSize: number;
  sessionOpen?: boolean;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  /** ms epoch of the quote */
  ts: number;
  /** daily change (from gRPC dailyStatistics), when available */
  dailyChange?: number;
  source: "grpc" | "rest" | "mock";
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CandlesResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
}

export interface FinanceInfo {
  balance: number;
  equity: number;
  profit: number;
  netProfit?: number;
  margin: number;
  freeMargin: number;
  marginLevel?: number;
  credit: number;
  currency: string;
  currencyPrecision: number;
}

export interface TradingAccount {
  uuid: string;
  created?: string;
  login: string;
  group: string;
  leverageRatioPercent?: number;
  accessRight?: string;
  accountType: "DEMO" | "REAL" | (string & {});
  accountDetails?: {
    firstName?: string;
    lastName?: string;
    [k: string]: unknown;
  };
  financeInfo?: FinanceInfo;
  /** Opaque optimistic-locking token; echo back on PATCH. */
  version?: number;
}

export interface UserAccount {
  uuid: string;
  email: string;
  created?: string;
  brokerId?: number;
}

export interface OpenPosition {
  id: string;
  symbol: string;
  alias?: string;
  volume: number;
  side: OrderSide;
  openTime: string;
  openPrice: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  commission?: number;
  swap?: number;
  profit?: number;
  netProfit?: number;
  comment?: string;
}

/** POST .../open-positions responds with one element per account. */
export interface AccountPositions {
  login: string;
  group: string;
  positions: OpenPosition[];
}

export interface ClosedPosition {
  id: string;
  uid?: string;
  symbol: string;
  alias?: string;
  volume: number;
  side: OrderSide;
  openTime: string;
  openPrice: number;
  closeTime: string;
  closePrice: number;
  commission?: number;
  swap?: number;
  profit: number;
  netProfit?: number;
  closingOrderId?: string;
  reason?: string;
  comment?: string;
}

/** Trade endpoints return an acknowledgement, not post-trade state. */
export interface TradeAck {
  status?: string;
  orderId?: string;
  positionId?: string;
  partialResponses?: PartialResponse[];
  [k: string]: unknown;
}

export interface PartialResponse {
  positionId?: string;
  orderId?: string;
  /** Non-empty means this item failed even though HTTP was 200. */
  errorMessage?: string;
  [k: string]: unknown;
}

export interface CreateTradingAccountRequest {
  group: string;
  leverageRatioPercent: number;
  accountType: "DEMO" | "REAL";
  accessRight?: string;
  isProView?: boolean;
  initialDeposit?: number;
  accountDetails: {
    firstName: string;
    lastName: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    bankAccount?: string;
    addressDetails?: {
      address?: string;
      country?: string;
      state?: string;
      city?: string;
      zipCode?: string;
    };
  };
}

/** The surface of the Broker API this app uses; implemented by HTTP + mock clients. */
export interface BrokerClient {
  readonly mode: "live" | "mock";

  // Prediction market (read-only)
  getBets(params?: { page?: number; size?: number; status?: string }): Promise<BetsPage>;
  getBet(uuid: string): Promise<BetDetail>;
  getBetOutcomes(uuid: string): Promise<Outcome[]>;

  // Instruments & prices
  getSymbols(group: string, symbols?: string[]): Promise<SymbolInfo[]>;
  getCandles(params: {
    symbol: string;
    interval: string;
    from?: string;
    to?: string;
    size?: number;
  }): Promise<CandlesResponse>;
  /** Latest prices. Live client approximates via candles; prefer the QuoteService. */
  getQuotes(symbols: string[]): Promise<Quote[]>;

  // Accounts
  getUserByEmail(email: string): Promise<UserAccount | null>;
  createUserAccount(email: string, password: string): Promise<UserAccount>;
  createTradingAccount(
    userUuid: string,
    req: CreateTradingAccountRequest,
  ): Promise<TradingAccount>;
  getTradingAccount(login: string): Promise<TradingAccount>;
  deposit(login: string, amount: number): Promise<void>;

  // Trading
  openPosition(req: {
    login: string;
    symbol: string;
    orderSide: OrderSide;
    volume: number;
    comment?: string;
  }): Promise<TradeAck>;
  closePositions(
    login: string,
    positions: { positionId: string; comment?: string }[],
  ): Promise<TradeAck>;
  closePartially(req: {
    login: string;
    positionId: string;
    volume: number;
    comment?: string;
  }): Promise<TradeAck>;

  // Trading data (read-only)
  getOpenPositions(login: string): Promise<AccountPositions[]>;
  getClosedPositions(login: string, from: string, to: string): Promise<ClosedPosition[]>;
}
