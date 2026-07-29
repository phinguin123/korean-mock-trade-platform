# Mock Stock Trade Platform

Monorepo for a real-time Korean mock trading platform:

- **`backend/`** — Node.js/TypeScript server: market data ingestion, in-memory order book, WebSocket broadcast, virtual leveraged matching engine
- **`frontend/`** — Next.js trading terminal UI

## Project layout

```
backend/     API + WebSocket server (port 8080)
frontend/    Next.js trading UI (port 3000)
```

## Local development

Run the backend and frontend in separate terminals — no Docker required.

```bash
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

- Backend: `http://localhost:8080` / `ws://localhost:8080`
- Frontend: `http://localhost:3000`

See [backend/README.md](backend/README.md) for API/WebSocket docs and [frontend/README.md](frontend/README.md) for UI setup.

## Docker Compose

Optional — use this for a containerized backend. Local day-to-day dev should still use `npm run dev` in each folder.

```bash
cp backend/.env.example backend/.env

# Production backend image
docker compose up --build

# Containerized backend dev (hot reload)
docker compose --profile dev up --build backend-dev

docker compose down
```

## Docs

| Path | Description |
|---|---|
| [backend/README.md](backend/README.md) | Market data, trading engine, HTTP/WS protocol, configuration |
| [frontend/README.md](frontend/README.md) | Trading terminal UI, Zustand store, component layout |
