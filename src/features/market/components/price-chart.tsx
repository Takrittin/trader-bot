"use client";

import { FormEvent, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_STOCK_BAR_FEED,
  DEFAULT_STOCK_BAR_TIMEFRAME,
  STOCK_BAR_FEEDS,
  STOCK_BAR_TIMEFRAMES,
  type StockBarsErrorResponse,
  type StockBarsResponse,
  type StockBarFeed,
  type StockBarSummary,
  type StockBarTimeframe,
} from "@/features/market/types";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";

type PriceChartProps = {
  initialData: StockBarsResponse | null;
  initialError: string | null;
  symbol: string;
};

type PriceChartState =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { data: StockBarsResponse; status: "success" };

type ChartBounds = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

const svgWidth = 920;
const svgHeight = 400;
const priceBounds: ChartBounds = {
  bottom: 268,
  left: 58,
  right: 835,
  top: 22,
};
const volumeBounds: ChartBounds = {
  bottom: 360,
  left: priceBounds.left,
  right: priceBounds.right,
  top: 300,
};
const missingValue = "Not available";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "percent",
});

const timeframeLabels: Record<StockBarTimeframe, string> = {
  "1Day": "1 day",
  "1Hour": "1 hour",
  "1Min": "1 min",
  "5Min": "5 min",
  "15Min": "15 min",
};

const feedLabels: Record<StockBarFeed, string> = {
  iex: "IEX",
  sip: "SIP",
};

function buildBarsEndpoint(
  symbol: string,
  timeframe: StockBarTimeframe,
  feed: StockBarFeed,
) {
  const searchParams = new URLSearchParams({
    feed,
    timeframe,
  });

  return `/api/alpaca/stocks/${encodeURIComponent(symbol)}/bars?${searchParams}`;
}

async function parseJsonResponse<T extends object>(response: Response) {
  const body = (await response.json()) as T | StockBarsErrorResponse;

  if (!response.ok) {
    throw new Error("error" in body ? body.error : "Unable to load bars.");
  }

  return body as T;
}

async function fetchBars(
  symbol: string,
  timeframe: StockBarTimeframe,
  feed: StockBarFeed,
  signal?: AbortSignal,
) {
  const response = await fetch(buildBarsEndpoint(symbol, timeframe, feed), {
    cache: "no-store",
    signal,
  });

  return parseJsonResponse<StockBarsResponse>(response);
}

function formatCurrency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return missingValue;
  }

  return currencyFormatter.format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAxisDateTime(value: string, timeframe: StockBarTimeframe): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (timeframe === "1Day") {
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function scaleLinear(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
) {
  if (domainMax === domainMin) {
    return (rangeMin + rangeMax) / 2;
  }

  const ratio = (value - domainMin) / (domainMax - domainMin);

  return rangeMax - ratio * (rangeMax - rangeMin);
}

function getPriceDomain(bars: StockBarSummary[]) {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;

  for (const bar of bars) {
    low = Math.min(low, bar.low);
    high = Math.max(high, bar.high);
  }

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return {
      max: 1,
      min: 0,
    };
  }

  const padding = Math.max((high - low) * 0.08, high * 0.002, 0.01);

  return {
    max: high + padding,
    min: Math.max(0, low - padding),
  };
}

function getUniqueIndexes(length: number) {
  return Array.from(
    new Set([
      0,
      Math.floor((length - 1) * 0.33),
      Math.floor((length - 1) * 0.66),
      length - 1,
    ]),
  ).filter((index) => index >= 0 && index < length);
}

function getChangeSummary(bars: StockBarSummary[]) {
  const first = bars[0];
  const last = bars.at(-1);

  if (!first || !last || first.open === 0) {
    return {
      change: null,
      percent: null,
    };
  }

  const change = last.close - first.open;

  return {
    change,
    percent: change / first.open,
  };
}

function PriceChartContent({ data }: { data: StockBarsResponse }) {
  const bars = data.bars;
  const last = bars.at(-1) ?? null;
  const change = getChangeSummary(bars);
  const totalVolume = bars.reduce((total, bar) => total + bar.volume, 0);
  const changeClassName =
    change.change === null || change.change >= 0
      ? "positive-value"
      : "negative-value";

  return (
    <>
      <div className="chart-stats">
        <div className="metric-card">
          <p>Last close</p>
          <strong>{formatCurrency(last?.close ?? null)}</strong>
          <small>{last ? formatDateTime(last.timestamp) : missingValue}</small>
        </div>
        <div className="metric-card">
          <p>Loaded change</p>
          <strong className={changeClassName}>
            {change.change === null
              ? missingValue
              : `${formatCurrency(change.change)} / ${percentFormatter.format(
                  change.percent ?? 0,
                )}`}
          </strong>
          <small>{bars.length} bars</small>
        </div>
        <div className="metric-card">
          <p>Volume</p>
          <strong>{compactNumberFormatter.format(totalVolume)}</strong>
          <small>
            {feedLabels[data.feed]} / {timeframeLabels[data.timeframe]}
          </small>
        </div>
      </div>

      {bars.length > 0 ? (
        <section className="chart-panel">
          <div className="chart-panel-heading">
            <div>
              <p className="panel-label">OHLCV</p>
              <h2>
                {data.symbol} {timeframeLabels[data.timeframe]}
              </h2>
            </div>
            <span>{formatDateTime(data.fetchedAt)}</span>
          </div>
          <div className="chart-shell">
            <PriceChartSvg bars={bars} timeframe={data.timeframe} />
          </div>
        </section>
      ) : (
        <section className="account-card">
          <p className="panel-label">No bars</p>
          <h2>No price bars returned</h2>
          <p className="muted">
            Alpaca returned no OHLCV bars for {data.symbol} with the selected
            feed and timeframe.
          </p>
        </section>
      )}
    </>
  );
}

function PriceChartSvg({
  bars,
  timeframe,
}: {
  bars: StockBarSummary[];
  timeframe: StockBarTimeframe;
}) {
  const visibleBars = bars.slice(-180);
  const priceDomain = getPriceDomain(visibleBars);
  const maxVolume = Math.max(...visibleBars.map((bar) => bar.volume), 1);
  const slotWidth =
    (priceBounds.right - priceBounds.left) / Math.max(visibleBars.length, 1);
  const candleWidth = Math.max(2, Math.min(10, slotWidth * 0.58));
  const priceTicks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;

    return priceDomain.max - (priceDomain.max - priceDomain.min) * ratio;
  });
  const timeTickIndexes = getUniqueIndexes(visibleBars.length);

  return (
    <svg
      aria-label="Candlestick price chart with volume bars"
      className="candlestick-svg"
      role="img"
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    >
      <rect className="chart-canvas" height={svgHeight} width={svgWidth} />

      {priceTicks.map((tick) => {
        const y = scaleLinear(
          tick,
          priceDomain.min,
          priceDomain.max,
          priceBounds.top,
          priceBounds.bottom,
        );

        return (
          <g key={tick}>
            <line
              className="chart-grid-line"
              x1={priceBounds.left}
              x2={priceBounds.right}
              y1={y}
              y2={y}
            />
            <text className="chart-axis-label" x={904} y={y + 4}>
              {formatCurrency(tick)}
            </text>
          </g>
        );
      })}

      <line
        className="chart-axis-line"
        x1={priceBounds.left}
        x2={priceBounds.left}
        y1={priceBounds.top}
        y2={volumeBounds.bottom}
      />
      <line
        className="chart-axis-line"
        x1={priceBounds.left}
        x2={priceBounds.right}
        y1={priceBounds.bottom}
        y2={priceBounds.bottom}
      />

      {visibleBars.map((bar, index) => {
        const x = priceBounds.left + slotWidth * index + slotWidth / 2;
        const openY = scaleLinear(
          bar.open,
          priceDomain.min,
          priceDomain.max,
          priceBounds.top,
          priceBounds.bottom,
        );
        const closeY = scaleLinear(
          bar.close,
          priceDomain.min,
          priceDomain.max,
          priceBounds.top,
          priceBounds.bottom,
        );
        const highY = scaleLinear(
          bar.high,
          priceDomain.min,
          priceDomain.max,
          priceBounds.top,
          priceBounds.bottom,
        );
        const lowY = scaleLinear(
          bar.low,
          priceDomain.min,
          priceDomain.max,
          priceBounds.top,
          priceBounds.bottom,
        );
        const isUp = bar.close >= bar.open;
        const className = isUp ? "is-up" : "is-down";
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 1.5);
        const volumeHeight =
          (bar.volume / maxVolume) * (volumeBounds.bottom - volumeBounds.top);

        return (
          <g className={className} key={`${bar.timestamp}-${index}`}>
            <line
              className="candle-wick"
              x1={x}
              x2={x}
              y1={highY}
              y2={lowY}
            />
            <rect
              className="candle-body"
              height={bodyHeight}
              rx={1}
              width={candleWidth}
              x={x - candleWidth / 2}
              y={bodyY}
            />
            <rect
              className="volume-bar"
              height={Math.max(volumeHeight, 1)}
              width={Math.max(candleWidth, 2)}
              x={x - Math.max(candleWidth, 2) / 2}
              y={volumeBounds.bottom - Math.max(volumeHeight, 1)}
            />
          </g>
        );
      })}

      {timeTickIndexes.map((index) => {
        const bar = visibleBars[index];
        const x = priceBounds.left + slotWidth * index + slotWidth / 2;

        return (
          <text
            className="chart-time-label"
            key={bar.timestamp}
            textAnchor={index === 0 ? "start" : "middle"}
            x={x}
            y={388}
          >
            {formatAxisDateTime(bar.timestamp, timeframe)}
          </text>
        );
      })}

      <text className="chart-volume-label" x={priceBounds.left} y={292}>
        Volume
      </text>
    </svg>
  );
}

export function PriceChart({
  initialData,
  initialError,
  symbol,
}: PriceChartProps) {
  const router = useRouter();
  const [symbolInput, setSymbolInput] = useState(symbol);
  const [timeframe, setTimeframe] = useState<StockBarTimeframe>(
    initialData?.timeframe ?? DEFAULT_STOCK_BAR_TIMEFRAME,
  );
  const [feed, setFeed] = useState<StockBarFeed>(
    initialData?.feed ?? DEFAULT_STOCK_BAR_FEED,
  );
  const [state, setState] = useState<PriceChartState>(() => {
    if (initialData) {
      return {
        data: initialData,
        status: "success",
      };
    }

    if (initialError) {
      return {
        message: initialError,
        status: "error",
      };
    }

    return { status: "loading" };
  });

  const loadBars = useCallback(
    async ({
      signal,
      showLoading = false,
    }: {
      signal?: AbortSignal;
      showLoading?: boolean;
    } = {}) => {
      if (showLoading) {
        setState({ status: "loading" });
      }

      try {
        const data = await fetchBars(symbol, timeframe, feed, signal);

        setState({
          data,
          status: "success",
        });
      } catch (error) {
        if (signal?.aborted) {
          return;
        }

        setState({
          message:
            error instanceof Error ? error.message : "Unable to load bars.",
          status: "error",
        });
      }
    },
    [feed, symbol, timeframe],
  );

  const hasLoadedData = state.status === "success";

  function handleChartSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSymbol = normalizeUnderlyingSymbol(symbolInput);

    if (nextSymbol && nextSymbol !== symbol) {
      router.push(`/charts/${encodeURIComponent(nextSymbol)}`);
      return;
    }

    if (nextSymbol) {
      void loadBars({ showLoading: true });
    }
  }

  return (
    <section className="price-chart" aria-labelledby="price-chart-heading">
      <div className="chart-toolbar">
        <div>
          <p className="panel-label">Underlying chart</p>
          <h2 id="price-chart-heading">{symbol} Candles</h2>
        </div>

        <form className="chart-controls" onSubmit={handleChartSubmit}>
          <label>
            Symbol
            <input
              maxLength={10}
              onChange={(event) => setSymbolInput(event.target.value)}
              value={symbolInput}
            />
          </label>
          <label>
            Timeframe
            <select
              onChange={(event) =>
                setTimeframe(event.target.value as StockBarTimeframe)
              }
              value={timeframe}
            >
              {STOCK_BAR_TIMEFRAMES.map((value) => (
                <option key={value} value={value}>
                  {timeframeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Feed
            <select
              onChange={(event) => setFeed(event.target.value as StockBarFeed)}
              value={feed}
            >
              {STOCK_BAR_FEEDS.map((value) => (
                <option key={value} value={value}>
                  {feedLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            Load chart
          </button>
        </form>
      </div>

      {state.status === "loading" ? (
        <section className="account-card" aria-busy="true">
          <p className="panel-label">Candles</p>
          <h2>Loading price bars</h2>
          <div className="loading-grid chain-loading" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="account-card error-card" role="alert">
          <p className="panel-label">Bars unavailable</p>
          <h2>Could not load price bars</h2>
          <p>{state.message}</p>
          <button
            className="button"
            onClick={() => void loadBars({ showLoading: true })}
            type="button"
          >
            Retry
          </button>
        </section>
      ) : null}

      {hasLoadedData && state.status === "success" ? (
        <PriceChartContent data={state.data} />
      ) : null}
    </section>
  );
}
