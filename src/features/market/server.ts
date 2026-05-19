import "server-only";

import {
  DEFAULT_STOCK_BAR_FEED,
  DEFAULT_STOCK_BAR_TIMEFRAME,
  type StockBarsResponse,
  type StockBarFeed,
  type StockBarTimeframe,
} from "@/features/market/types";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import type { AlpacaStockBar } from "@/lib/alpaca/types";

export const stockBarTimeframeDefaults: Record<
  StockBarTimeframe,
  {
    limit: number;
    lookbackDays: number;
  }
> = {
  "1Day": {
    limit: 260,
    lookbackDays: 390,
  },
  "1Hour": {
    limit: 240,
    lookbackDays: 45,
  },
  "1Min": {
    limit: 390,
    lookbackDays: 2,
  },
  "5Min": {
    limit: 390,
    lookbackDays: 5,
  },
  "15Min": {
    limit: 260,
    lookbackDays: 12,
  },
};

type LoadStockBarsParams = {
  end?: string;
  feed?: StockBarFeed;
  start?: string;
  symbol: string;
  timeframe?: StockBarTimeframe;
};

export function toIsoDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function getDefaultStockBarsStart(
  timeframe: StockBarTimeframe,
  end: string,
): string {
  const endDate = new Date(end);
  const startDate = new Date(endDate);

  startDate.setUTCDate(
    startDate.getUTCDate() - stockBarTimeframeDefaults[timeframe].lookbackDays,
  );

  return startDate.toISOString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toBarSummary(bar: AlpacaStockBar): StockBarsResponse["bars"][number] {
  return {
    close: bar.c,
    high: bar.h,
    low: bar.l,
    open: bar.o,
    timestamp: bar.t,
    tradeCount: isFiniteNumber(bar.n) ? bar.n : null,
    volume: bar.v,
    vwap: isFiniteNumber(bar.vw) ? bar.vw : null,
  };
}

function hasValidOhlcv(bar: AlpacaStockBar): boolean {
  return (
    isFiniteNumber(bar.o) &&
    isFiniteNumber(bar.h) &&
    isFiniteNumber(bar.l) &&
    isFiniteNumber(bar.c) &&
    isFiniteNumber(bar.v)
  );
}

export function isEnvValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Invalid server environment:")
  );
}

export function getStockBarsErrorMessage(error: unknown): string {
  if (isEnvValidationError(error)) {
    return "Alpaca paper credentials are not configured correctly. Check .env.local.";
  }

  if (error instanceof AlpacaClientError) {
    return "Unable to fetch Alpaca stock bars from the data API.";
  }

  return "Unable to load stock bars.";
}

export function getStockBarsErrorStatus(error: unknown): number {
  if (error instanceof AlpacaClientError) {
    return error.status;
  }

  return 500;
}

export async function loadStockBars({
  end = new Date().toISOString(),
  feed = DEFAULT_STOCK_BAR_FEED,
  start,
  symbol,
  timeframe = DEFAULT_STOCK_BAR_TIMEFRAME,
}: LoadStockBarsParams): Promise<StockBarsResponse> {
  const resolvedStart = start ?? getDefaultStockBarsStart(timeframe, end);
  const client = createAlpacaPaperClient();
  const response = await client.getStockBars(symbol, {
    adjustment: "raw",
    end,
    feed,
    limit: stockBarTimeframeDefaults[timeframe].limit,
    start: resolvedStart,
    timeframe,
  });
  const bars = response.bars.filter(hasValidOhlcv).map(toBarSummary);

  return {
    bars,
    end,
    feed,
    fetchedAt: new Date().toISOString(),
    nextPageToken: response.next_page_token ?? null,
    start: resolvedStart,
    symbol,
    timeframe,
  };
}
