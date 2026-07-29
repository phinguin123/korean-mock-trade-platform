import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { config, primarySymbol } from './config';
import { createMarketDataAdapter, MarketDataAdapter } from './adapters/MarketDataStream';
import { MatchingEngine } from './engine/MatchingEngine';
import { MarketDataStore } from './store/MarketDataStore';
import { Broadcaster } from './websocket/Broadcaster';

// ---------------------------------------------------------------------------
// HTTP app: health check + a thin REST fallback for clients that can't hold
// a persistent websocket (e.g. simple polling dashboards, uptime monitors).
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    marketDataSource: config.market.source,
    trackedSymbols: config.market.symbols,
    connectedClients: broadcaster?.clientCount ?? 0,
    timestamp: Date.now(),
  });
});

app.get('/api/market/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;
  const state = MarketDataStore.getState(symbol);
  if (!state) {
    res.status(404).json({ error: `Symbol "${symbol}" is not tracked by this server.` });
    return;
  }
  res.status(200).json(state);
});

app.get('/api/portfolio/:userId', (req: Request, res: Response) => {
  const { userId } = req.params;
  const portfolio = MatchingEngine.getOrCreatePortfolio(userId);
  res.status(200).json(portfolio);
});

// Fallback 404 + error handler so malformed REST calls never crash the process.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const httpServer = createServer(app);
let broadcaster: Broadcaster | null = null;
let marketAdapter: MarketDataAdapter | null = null;

async function bootstrap(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[server] booting - market data source: ${config.market.source}`);

  marketAdapter = createMarketDataAdapter();
  await marketAdapter.start();

  broadcaster = new Broadcaster(httpServer);

  httpServer.listen(config.server.port, config.server.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[server] HTTP + WebSocket listening on http://${config.server.host}:${config.server.port} ` +
        `(primary symbol: ${primarySymbol()})`,
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[server] received ${signal}, shutting down gracefully...`);
  try {
    broadcaster?.shutdown();
    await marketAdapter?.stop();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    // eslint-disable-next-line no-console
    console.log('[server] shutdown complete.');
    process.exit(0);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[server] error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[server] unhandled promise rejection:', reason);
});

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal error during bootstrap:', err);
  process.exit(1);
});
