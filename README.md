# MTR Predict — a Kalshi-style prediction market on the Match-Trader Broker API v2

A web app where you browse event markets (politics, sports, crypto, economics…),
see live YES/NO prices in cents, and **trade directly from the page** — every
order, position and settlement flows through the
[Match-Trader Broker API v2](https://app.theneo.io/match-trade/broker-api-v2/introduction).

Built with Next.js 15 (App Router) + TypeScript + Tailwind. No database — the
Broker API is the source of truth; the browser session is a signed cookie.

## What you can do

- **Browse markets** — Bets from the Prediction Market endpoints, grouped by
  category, with search, binary + multi-choice layouts, and Kalshi-style
  `Yes 62¢ / No 39¢` buttons.
- **Market pages** — probability chart (from `/v1/candles`), outcome list,
  rules, and a trade ticket with cost / payout / potential-profit math
  (PRED contracts price in 0..1 and settle at $1.00 / $0.00).
- **Trade** — "Buy Yes" opens a `BUY` market position on the outcome's
  `instrumentYesName`, "Buy No" on `instrumentNoName`
  (`POST /v1/trading-accounts/positions/open`). Sell fully or partially from
  the portfolio (`positions/close`, `positions/close-partially`).
- **Portfolio** — equity/balance/open P&L/free margin, open positions with
  live prices, and history including platform-settled positions.
- **Onboarding** — create a demo account (user account + DEMO trading account
  with an initial deposit) or attach an existing trading-account login.
- **Live prices** — a single server-side gRPC quotations stream
  (`getQuotationsWithMarkupStream`) feeds a shared quote cache; REST candles
  are the automatic fallback. Cards/tickets poll the app's own `/api/quotes`.

## Quick start

```bash
npm install

# 1) No credentials? Run on built-in demo data (simulated markets + prices):
npm run dev            # BROKER_MODE defaults to mock without a token

# 2) Trade through the real Broker API:
cp .env.example .env   # then set BROKER_API_TOKEN (+ BROKER_GROUP)
npm run dev
```

Open http://localhost:3000. In mock mode you can attach the seeded demo
account with login **820000**, or create a fresh one via *Sign up*.

`npm test` runs the unit suite; `npm run typecheck` and `npm run build` for CI.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `BROKER_API_URL` | `https://broker-api-v2-demo.match-trader.com` | REST base URL (per-broker in production). |
| `BROKER_API_TOKEN` | — | Bearer token from Match-Trade IT-Support. Empty → mock mode. |
| `BROKER_GROUP` | `testUSD` | Group for new trading accounts + symbol lookups (must exist for your broker — see `GET /v1/group-names`). |
| `BROKER_GRPC_HOST` | `grpc-broker-api-v2-demo.match-trader.com:8083` | gRPC quote stream; empty disables gRPC (REST fallback only). |
| `BROKER_MODE` | auto | Force `live` or `mock`. |
| `SESSION_SECRET` | dev fallback | HMAC key for session cookies — set a long random string. |
| `DEMO_INITIAL_DEPOSIT` | `10000` | Deposit for new demo accounts; also caps top-ups. |
| `DISABLE_DEPOSITS` | — | `true` hides/blocks the top-up endpoint. |

## How Kalshi concepts map to the Broker API

| In the UI | Broker API v2 |
|---|---|
| Event / market card | `GET /v1/bets` (+ `GET /v1/bets/{uuid}` for subtitle/close date) |
| Outcomes with YES/NO prices | `GET /v1/bets/{uuid}/outcomes` → `instrumentYesName` / `instrumentNoName` (PRED instruments, prices 0..1) |
| Price chart | `GET /v1/candles?symbol=<instrument>&interval=…` |
| Live tickers | gRPC `QuotationsServiceExternal.getQuotationsWithMarkupStream` (fallback: latest M1 candle) |
| Buy Yes / Buy No | `POST /v1/trading-accounts/positions/open` with `orderSide: BUY` on the YES/NO instrument |
| Sell / partial sell | `POST /v1/trading-accounts/positions/close` / `…/close-partially` |
| Positions & P&L | `POST /v1/trading-accounts/trading-data/open-positions` + quotes |
| History & settlements | `POST /v1/trading-accounts/trading-data/closed-positions` (settlement closes at 1.00/0.00 are flagged) |
| Balance / equity chip | `GET /v1/trading-accounts/{login}` (`financeInfo`) |
| Sign up | `POST /v1/user-accounts` → `POST /v1/user-accounts/{uuid}/trading-accounts` (DEMO + `initialDeposit`) |
| Top up demo funds | `POST /v1/trading-accounts/{login}/deposit` |

### API behaviours the app respects

- **Acks, not fills** — trade endpoints return an acknowledgement; the UI
  refreshes positions/account state after every order instead of trusting the
  200, and `partialResponses[].errorMessage` is checked on every bulk call.
- **Non-idempotent balance ops** — deposits are sent exactly once, never
  retried, and the button locks while in flight.
- **Duplicate users return 409** — sign-up checks
  `GET /v1/user-accounts/email/{email}` first and matches the
  `error://broker-api/user-account/already-exists` type.
- **Rate limits (500 req/min shared)** — server-side caches (bets 30 s,
  outcomes 5 min, quotes via one gRPC stream with bounded REST fallback +
  per-symbol cooldowns) keep upstream traffic small no matter how many
  browsers are open.
- **Closed positions carry no login** — history is always queried per login.
- **Prediction Market endpoints need a dedicated API permission** — a JSON
  `403` from the API is surfaced with that hint.

## Architecture

```
src/lib/broker/types.ts    Broker API payload types + BrokerClient interface
src/lib/broker/http.ts     REST client (Bearer auth, error model, pagination)
src/lib/broker/mock.ts     Full in-memory simulator (markets, random-walk
                           prices, margin/P&L semantics) — powers mock mode & tests
src/lib/broker/grpc-quotes.ts  gRPC quote stream (reconnect, heartbeat watchdog)
src/lib/quotes.ts          Shared quote cache: gRPC push, REST fallback
src/lib/markets.ts         Bets+outcomes+quotes → UI views; symbol→market index
src/lib/portfolio.ts       Positions enriched with market refs and live P&L
src/lib/session.ts         Stateless HMAC-signed cookie sessions
src/app/api/*              Route handlers the UI talks to (the token never
                           leaves the server)
src/app/*, src/components/*  Kalshi-style UI (home grid, market page, portfolio)
proto/broker_api_v2.proto  Vendored gRPC contract (from the Broker-API skill)
```

## ⚠️ Demo scope

The Broker API is an **administrative** API: one broker-level token, no
end-user password verification. "Attach existing login" therefore trusts the
login you type, and sign-up performs admin-side account creation. That's fine
for an integration demo on the shared sandbox (`brokerID=0`) — put a real
identity layer (and your own accounts directory) in front before exposing this
to actual clients. Not investment advice; demo only.
