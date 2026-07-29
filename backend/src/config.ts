import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseListEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseLeverages(name: string, fallback: number[]): number[] {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export type MarketDataSource = 'mock' | 'kiwoom';

export const config = {
  server: {
    port: parseIntEnv('PORT', 8080),
    host: process.env.HOST ?? '0.0.0.0',
  },
  market: {
    source: (process.env.MARKET_DATA_SOURCE ?? 'mock') as MarketDataSource,
    symbols: parseListEnv('MARKET_SYMBOLS', ['005930']),
    symbolNames: parseListEnv('MARKET_SYMBOL_NAMES', ['Samsung Electronics']),
  },
  mock: {
    tickIntervalMs: parseIntEnv('MOCK_TICK_INTERVAL_MS', 100),
    basePrice: parseIntEnv('MOCK_BASE_PRICE', 65400),
    volatilityBps: parseIntEnv('MOCK_VOLATILITY_BPS', 15),
  },
  kiwoom: {
    restBaseUrl: process.env.KIWOOM_REST_BASE_URL ?? 'https://mockapi.kiwoom.com',
    wsUrl: process.env.KIWOOM_WS_URL ?? 'wss://mockapi.kiwoom.com:10000/api/dostk/websocket',
    appKey: process.env.KIWOOM_APP_KEY ?? '',
    appSecret: process.env.KIWOOM_APP_SECRET ?? '',
    isMock: (process.env.KIWOOM_IS_MOCK ?? 'Y').toUpperCase() !== 'N',
  },
  trading: {
    initialVirtualBalance: parseIntEnv('INITIAL_VIRTUAL_BALANCE', 100_000_000),
    allowedLeverages: parseLeverages('ALLOWED_LEVERAGES', [1, 2, 3, 5]),
  },
  ws: {
    heartbeatIntervalMs: parseIntEnv('WS_HEARTBEAT_INTERVAL_MS', 15_000),
    heartbeatTimeoutMs: parseIntEnv('WS_HEARTBEAT_TIMEOUT_MS', 30_000),
  },
} as const;

export function primarySymbol(): string {
  return config.market.symbols[0] ?? '005930';
}
