export const STOCK_BAR_TIMEFRAMES = [
  "1Min",
  "5Min",
  "15Min",
  "1Hour",
  "1Day",
] as const;

export const STOCK_BAR_FEEDS = ["iex", "sip"] as const;

export const DEFAULT_STOCK_BAR_FEED: StockBarFeed = "iex";
export const DEFAULT_STOCK_BAR_TIMEFRAME: StockBarTimeframe = "15Min";

export type StockBarTimeframe = (typeof STOCK_BAR_TIMEFRAMES)[number];
export type StockBarFeed = (typeof STOCK_BAR_FEEDS)[number];

export type StockBarSummary = {
  close: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  tradeCount: number | null;
  volume: number;
  vwap: number | null;
};

export type StockBarsResponse = {
  bars: StockBarSummary[];
  end: string;
  feed: StockBarFeed;
  fetchedAt: string;
  nextPageToken: string | null;
  start: string;
  symbol: string;
  timeframe: StockBarTimeframe;
};

export type StockBarsErrorResponse = {
  error: string;
};

export function isStockBarTimeframe(
  value: string | null,
): value is StockBarTimeframe {
  return STOCK_BAR_TIMEFRAMES.some((timeframe) => timeframe === value);
}

export function isStockBarFeed(value: string | null): value is StockBarFeed {
  return STOCK_BAR_FEEDS.some((feed) => feed === value);
}
