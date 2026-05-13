# AutoTrade Options Bot

Paper-trading-only Next.js application for defined-risk options workflows using Alpaca.

## Guardrails

- Paper trading only.
- Alpaca keys stay server-side.
- Live trading URLs are rejected by environment validation and the Alpaca client.
- No order submission code is implemented in this scaffold.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in paper Alpaca credentials.

3. Run the app:

   ```bash
   npm run dev
   ```

## Project Layout

- `src/app` - Next.js App Router entry points.
- `src/lib/env` - server-only environment validation.
- `src/lib/alpaca` - server-only Alpaca paper client.
- `src/features` - Phase 1 feature areas.
