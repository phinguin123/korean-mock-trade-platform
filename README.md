# Mock Stock Trade Platform — Step 1: Real-Time Market Data & Virtual Trading Server

A centralized Node.js/TypeScript backend that:

- Ingests real-time stock ticks (Kiwoom REST/WebSocket API, or a built-in mock simulator)
- Caches Level-2-style market state (top 10 bid/ask, last 50 ticks) atomically in RAM
- Broadcasts order book/tick deltas to web clients over WebSockets
- Executes slippage-free, leveraged virtual trades in memory with automatic liquidation

## Architecture

```
src/
├── config.ts                      Centralized env parsing (dotenv + validation)
├── types/market.ts                All shared interfaces (OrderBook, Tick, TradeOrder, Position, Portfolio, WSMessage, ...)
├── store/MarketDataStore.ts       Singleton in-memory RAM cache (Level-2 tape + last 50 ticks) + event emitter
├── adapters/MarketDataStream.ts   MockMarketSimulator (100ms ticks) + KiwoomAdapter (OAuth2 + WebSocket real-time feed)
├── engine/MatchingEngine.ts       Virtual order matching, margin/leverage validation, liquidation engine
├── websocket/Broadcaster.ts       ws server: snapshot sync, delta broadcast, heartbeats, zod-validated client actions
└── server.ts                      Entry point: boots Express (HTTP) + ws (WebSocket) on the same port
```

**Data flow:** `MarketDataAdapter` (mock or Kiwoom) → `MarketDataStore` (RAM cache, emits `tick`/`orderbook` events) → `Broadcaster` (fans out to subscribed clients) and `MatchingEngine` (checks liquidations on every tick). Client trading actions flow `Broadcaster` → zod validation → `MatchingEngine` → ack/reject back to the client.

## Requirements

- Node.js **>= 18** (Node 20+ recommended; developed/tested against Node 24 LTS)
- npm

Optional, for containerized runs:

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/) (v2+)

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` as needed (see [Configuration](#configuration) below). The defaults run entirely offline against the mock simulator — no external credentials required.

## Local development

For day-to-day work, run the server natively on your machine — no Docker required.

```bash
# Hot reload via ts-node-dev, mock market data (default)
npm run dev

# Explicitly force the mock simulator
npm run start:mock

# Run against live Kiwoom REST/WebSocket feed (requires KIWOOM_APP_KEY/SECRET in .env)
npm run start:kiwoom

# Type-check only, no emit
npm run typecheck
```

The server listens on `PORT` (default **8080**) for both HTTP and WebSocket — connect at `http://localhost:8080` and `ws://localhost:8080`.

To run a production-style build locally (compile TypeScript, then plain Node):

```bash
npm run build
npm start
```

## Running with Docker Compose

Docker Compose is optional — use it when you want a containerized production image or to mirror a deployed environment. It is not required for local development; use `npm run dev` above instead.

```bash
# Production image: compile TypeScript, run compiled Node output
docker compose up --build

# Detached
docker compose up --build -d

# Containerized dev (hot reload with src/ mounted) — alternative to npm run dev
docker compose --profile dev up --build server-dev

# Stop and remove containers
docker compose down
```

To use the live Kiwoom feed instead of the mock simulator, set `MARKET_DATA_SOURCE=kiwoom` and your `KIWOOM_APP_KEY` / `KIWOOM_APP_SECRET` in `.env`, then restart the stack (or re-run `npm run dev` locally).

## HTTP Endpoints

| Method | Path                     | Description                                      |
|--------|--------------------------|---------------------------------------------------|
| GET    | `/health`                | Liveness/readiness probe + connected client count |
| GET    | `/api/market/:symbol`    | REST fallback: current full market state          |
| GET    | `/api/portfolio/:userId` | REST fallback: a virtual portfolio snapshot        |

## WebSocket Protocol

Connect to `ws://localhost:8080`. Each connection is assigned an ephemeral virtual `userId` seeded with `INITIAL_VIRTUAL_BALANCE`.

### Server → Client messages

| Type                   | When                                             |
|------------------------|---------------------------------------------------|
| `SNAPSHOT`              | Immediately on connect, and on every `SUBSCRIBE`  |
| `TICK_UPDATE`           | On every market tick (~100ms with the mock feed)  |
| `ORDER_ACK`             | Order filled                                       |
| `ORDER_REJECT`          | Order failed business validation (e.g. margin)     |
| `POSITION_CLOSED`       | User voluntarily closed a position                 |
| `POSITION_LIQUIDATED`   | Engine force-closed a position (price hit liq. boundary) |
| `PORTFOLIO_UPDATE`      | Reserved for out-of-band portfolio pushes          |
| `ERROR`                 | Malformed frame / schema validation failure        |
| `PONG`                  | Reply to client `PING`                             |

### Client → Server messages (zod-validated)

**Subscribe to a symbol** (default subscription is the primary configured symbol):
```json
{ "type": "SUBSCRIBE", "symbol": "005930" }
```

**Place an order:**
```json
{
  "type": "PLACE_ORDER",
  "symbol": "005930",
  "side": "BUY",
  "orderType": "MARKET",
  "qty": 10,
  "leverage": 5
}
```
`price` is required (and must be immediately marketable) for `orderType: "LIMIT"`.

**Close a position:**
```json
{ "type": "CLOSE_POSITION", "positionId": "<uuid>" }
```

**Heartbeat ping** (application-level, in addition to ws protocol ping/pong):
```json
{ "type": "PING" }
```

### Example client session

```js
const ws = new WebSocket('ws://localhost:8080');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'SNAPSHOT') {
    console.log('Wallet balance:', msg.portfolio.balance);
    ws.send(JSON.stringify({
      type: 'PLACE_ORDER', symbol: '005930', side: 'BUY', orderType: 'MARKET', qty: 10, leverage: 5,
    }));
  }
  if (msg.type === 'ORDER_ACK') {
    console.log('Filled at', msg.order.fillPrice, '- position:', msg.portfolio.positions[0]);
  }
};
```

## Trading Engine Rules

- **Margin:** `requiredMargin = (fillPrice * qty) / leverage`. Rejected if `virtualBalance < requiredMargin`.
- **Leverage:** restricted to `ALLOWED_LEVERAGES` (default `1, 2, 3, 5`).
- **Execution:** `MARKET` orders fill instantly, slippage-free, at the cached `currentPrice`. `LIMIT` orders fill immediately only if already marketable against the current price (Step 1 has no resting client order book yet — that's a natural Step 2 extension).
- **Liquidation price:**
  - Long (`BUY`): `entryPrice * (1 - 1/leverage)`
  - Short (`SELL`): `entryPrice * (1 + 1/leverage)`
- **Isolated margin:** each position can lose at most the margin locked against it; realized loss is clamped at `-margin` so a single position can never drive a virtual account negative.
- **Auto-liquidation:** on every tick, `MatchingEngine` scans open positions for that symbol and force-closes any position whose liquidation boundary has been touched, emitting `POSITION_LIQUIDATED` to the owning client.

## Configuration

All configuration is via environment variables (`.env`, see `.env.example` for the full annotated list):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP + WS port |
| `MARKET_DATA_SOURCE` | `mock` | `mock` or `kiwoom` |
| `MARKET_SYMBOLS` | `005930` | Comma-separated symbol codes to track |
| `MARKET_SYMBOL_NAMES` | `Samsung Electronics` | Comma-separated display names, aligned by index |
| `MOCK_TICK_INTERVAL_MS` | `100` | Mock simulator tick frequency |
| `MOCK_BASE_PRICE` | `65400` | Mock simulator starting price |
| `MOCK_VOLATILITY_BPS` | `15` | Mock simulator max move per tick, in basis points |
| `KIWOOM_REST_BASE_URL` | `https://mockapi.kiwoom.com` | Kiwoom REST base (swap for `https://api.kiwoom.com` in production) |
| `KIWOOM_WS_URL` | `wss://mockapi.kiwoom.com:10000/api/dostk/websocket` | Kiwoom real-time WebSocket endpoint |
| `KIWOOM_APP_KEY` / `KIWOOM_APP_SECRET` | — | Issued from the [Kiwoom REST API portal](https://openapi.kiwoom.com) |
| `INITIAL_VIRTUAL_BALANCE` | `100000000` | Starting cash for every new virtual user (KRW) |
| `ALLOWED_LEVERAGES` | `1,2,3,5` | Permitted leverage multipliers |
| `WS_HEARTBEAT_INTERVAL_MS` | `15000` | Server ping frequency |
| `WS_HEARTBEAT_TIMEOUT_MS` | `30000` | Terminate a connection if no pong received within this window |

## Kiwoom Live Integration Notes

Kiwoom's modern REST API (replacing the legacy 32-bit OCX `OpenAPI+`) uses:

1. **OAuth2 client-credentials** — `POST {KIWOOM_REST_BASE_URL}/oauth2/token` with `{ grant_type: "client_credentials", appkey, secretkey }` to obtain a bearer token.
2. **Real-time WebSocket** — connect to `KIWOOM_WS_URL`, send `{ trnm: "LOGIN", token }`, then `{ trnm: "REG", grp_no, refresh, data: [{ item: [symbols], type: ["0B", "0D"] }] }` to subscribe to stock executions (`0B`) and order book depth (`0D`). The server periodically sends `{ trnm: "PING" }`, which must be echoed back verbatim to keep the session alive.

`KiwoomAdapter` in `src/adapters/MarketDataStream.ts` implements this full auth/connect/subscribe/reconnect lifecycle. The only piece left as an explicit TODO is `mapExecutionPayload` / `mapOrderBookPayload` — the exact FID-to-field mapping is per-TR and documented in your issued app's Kiwoom developer portal; wire those two functions up against your actual response shape before flipping `MARKET_DATA_SOURCE=kiwoom` in production. Everything else (token refresh, exponential-backoff reconnect, heartbeat, subscription bookkeeping) is production-ready as-is.

## Extending Beyond Step 1

This step intentionally keeps trading logic minimal (instant market execution, no resting order book for client orders, single-process in-memory state). Natural next steps:

- Persist portfolios/positions to a database or Redis for durability across restarts
- Resting `LIMIT` order book with partial fills
- Multi-symbol liquidation sweep optimized with a price-indexed structure instead of a full portfolio scan
- Horizontal scaling via a shared pub/sub layer (Redis, NATS) so `MarketDataStore` state can be shared across multiple broadcaster processes
