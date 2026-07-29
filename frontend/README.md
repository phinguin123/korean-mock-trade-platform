# Mock Stock Trade Platform — Step 2: Trading Terminal (Next.js)

A reactive, high-density trading UI that connects over WebSocket to the Step 1 Node.js backend and renders Level 2 order book depth, instant leverage selection, one-tap execution, and floating PnL "micro-dopamine" feedback.

## Architecture

```
src/
├── types/trading.ts                       Frontend mirror of the backend wire schema
├── hooks/useMarketData.ts                 Zustand store: WS connection, reconnect/backoff, heartbeat, delta state
└── components/trading/
    ├── PriceHeader.tsx                    Ticker header, flash effects, tick tape
    ├── OrderBook.tsx                      Level 2 depth (top 10 bids/asks, depth bars, spread)
    ├── LeverageSelector.tsx               1x / 2x / 3x / 5x (Meme Mode) pills + live margin preview
    ├── OrderPanel.tsx                     One-tap BUY/SELL, liquidation preview, position summary
    ├── DopamineEffects.tsx                Floating PnL particles + Web Audio synth stings
    └── TradingTerminal.tsx                Grid layout wiring everything together
```

`useMarketData` is a single Zustand store. Components subscribe only to the slices they render (price, book, portfolio, leverage, ...), so a 100ms tick stream never forces a full-page re-render — only the price/book/tape actually re-paint.

## Requirements

- Node.js **>= 18**
- The backend running locally at `ws://localhost:8080` (see [backend/README.md](../backend/README.md))

## Setup

```bash
cd frontend
npm install
```

Create `.env.local` if you need to override defaults:

```bash
# optional — defaults shown
echo 'NEXT_PUBLIC_WS_URL=ws://localhost:8080' > .env.local
echo 'NEXT_PUBLIC_DEFAULT_SYMBOL=005930' >> .env.local
```

`.env.local` controls which backend/symbol the terminal connects to:

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8080` | Backend WebSocket endpoint |
| `NEXT_PUBLIC_DEFAULT_SYMBOL` | `005930` | Symbol subscribed to on connect (must match `MARKET_SYMBOLS` on the backend) |

## Running

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The terminal connects automatically, subscribes to the default symbol, and starts streaming ticks/order book updates immediately.

```bash
npm run build   # production build
npm start       # serve the production build
npm run lint    # eslint
```

## Notable behavior

- **Reconnects automatically** with exponential backoff (capped at 10s) if the WebSocket drops, and shows `LIVE` / `RECONNECTING` / `OFFLINE` in the header.
- **Heartbeat**: sends an app-level `PING` every 10s and surfaces round-trip latency next to the connection badge.
- **Flash indicator**: price header and order book spread flash green/red for 150ms on every tick direction change.
- **Margin/liquidation math** mirrors the backend `MatchingEngine` exactly:
  - `requiredMargin = (qty * price) / leverage`
  - `liqPrice(long) = price * (1 - 1/leverage)`, `liqPrice(short) = price * (1 + 1/leverage)`
  - Execution buttons disable and turn red when required margin exceeds available cash balance.
- **Dopamine feedback**: every `ORDER_ACK` and `POSITION_CLOSED`/`POSITION_LIQUIDATED` message triggers a floating ₩ particle over the order panel plus a synthesized Web Audio chime (no audio files) — a bright ascending arpeggio for fills/profit, a low thud for losses.
