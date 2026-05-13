# AutoTrade Options Bot - Phase 1 Spec

Build a paper-trading-only web application using Alpaca.

## Hard rules
- Paper trading only.
- No live orders.
- No naked options.
- No 0DTE.
- No market orders for options.
- All Alpaca keys must stay server-side.
- Every generated order must pass risk checks before submission.
- Every bot decision must be logged.

## Phase 1 features
1. Account dashboard.
2. Option chain viewer.
3. Vertical spread candidate generator.
4. Risk check engine.
5. Paper order preview.
6. Paper order submit/cancel.
7. Trade log.
8. Emergency kill switch.

## First strategy
Defined-risk vertical spreads only.