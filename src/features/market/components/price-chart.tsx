"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
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
import {
  calculateTrendStrategy,
  type TrendStrategySignal,
} from "@/features/market/strategy";
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

type LightweightChartModel = {
  candles: CandlestickData<UTCTimestamp>[];
  ema20: LineData<UTCTimestamp>[];
  ema50: LineData<UTCTimestamp>[];
  markers: SeriesMarker<UTCTimestamp>[];
  signal: TrendStrategySignal;
  trendline: LineData<UTCTimestamp>[];
  volume: HistogramData<UTCTimestamp>[];
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
const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
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

const statusLabels: Record<TrendStrategySignal["status"], string> = {
  not_ready: "Not ready",
  ready: "Ready zone",
  watch: "Watch pullback",
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

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return missingValue;
  }

  return numberFormatter.format(value);
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

function toChartTime(timestamp: string): UTCTimestamp {
  return Math.floor(new Date(timestamp).getTime() / 1000) as UTCTimestamp;
}

function buildEmaSeries(
  bars: StockBarSummary[],
  period: number,
): LineData<UTCTimestamp>[] {
  if (bars.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const series: LineData<UTCTimestamp>[] = [];
  let ema =
    bars
      .slice(0, period)
      .reduce((sum, bar) => sum + bar.close, 0) / period;

  series.push({
    time: toChartTime(bars[period - 1].timestamp),
    value: ema,
  });

  for (const bar of bars.slice(period)) {
    ema = bar.close * multiplier + ema * (1 - multiplier);
    series.push({
      time: toChartTime(bar.timestamp),
      value: ema,
    });
  }

  return series;
}

function buildLightweightChartModel(
  data: StockBarsResponse,
): LightweightChartModel {
  const signal = calculateTrendStrategy(data.bars);
  const candles = data.bars.map<CandlestickData<UTCTimestamp>>((bar) => ({
    close: bar.close,
    high: bar.high,
    low: bar.low,
    open: bar.open,
    time: toChartTime(bar.timestamp),
  }));
  const volume = data.bars.map<HistogramData<UTCTimestamp>>((bar) => ({
    color:
      bar.close >= bar.open ? "rgba(21, 122, 90, 0.34)" : "rgba(164, 49, 36, 0.30)",
    time: toChartTime(bar.timestamp),
    value: bar.volume,
  }));
  const lastBar = data.bars.at(-1);
  const trendline =
    signal.trendline.first && signal.trendline.currentPrice && lastBar
      ? [
          {
            time: toChartTime(signal.trendline.first.timestamp),
            value: signal.trendline.first.price,
          },
          {
            time: toChartTime(lastBar.timestamp),
            value: signal.trendline.currentPrice,
          },
        ]
      : [];
  const markers: SeriesMarker<UTCTimestamp>[] = [];

  if (signal.trendline.first) {
    markers.push({
      color: "#2f6690",
      position: "belowBar",
      shape: "circle",
      text: "Pivot 1",
      time: toChartTime(signal.trendline.first.timestamp),
    });
  }

  if (signal.trendline.second) {
    markers.push({
      color: "#157a5a",
      position: "belowBar",
      shape: "circle",
      text: "Pivot 2",
      time: toChartTime(signal.trendline.second.timestamp),
    });
  }

  if (lastBar && signal.entry) {
    markers.push({
      color: signal.status === "ready" ? "#157a5a" : "#9a5b00",
      position: "belowBar",
      shape: "arrowUp",
      text: signal.status === "ready" ? "Buy zone" : "Watch",
      time: toChartTime(lastBar.timestamp),
    });
  }

  return {
    candles,
    ema20: buildEmaSeries(data.bars, 20),
    ema50: buildEmaSeries(data.bars, 50),
    markers,
    signal,
    trendline,
    volume,
  };
}

function PriceChartCanvas({ model }: { model: LightweightChartModel }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || model.candles.length === 0) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      crosshair: {
        mode: 0,
      },
      grid: {
        horzLines: {
          color: "#dde3dc",
        },
        vertLines: {
          color: "#edf1eb",
        },
      },
      layout: {
        background: {
          color: "#f9faf7",
          type: ColorType.Solid,
        },
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        textColor: "#667069",
      },
      rightPriceScale: {
        borderColor: "#c7d0c8",
        scaleMargins: {
          bottom: 0.24,
          top: 0.08,
        },
      },
      timeScale: {
        borderColor: "#c7d0c8",
        rightOffset: 8,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      borderDownColor: "#a43124",
      borderUpColor: "#157a5a",
      downColor: "#a43124",
      priceLineVisible: true,
      upColor: "#157a5a",
      wickDownColor: "#a43124",
      wickUpColor: "#157a5a",
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceLineVisible: false,
      priceScaleId: "",
    });
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#2f6690",
      lineWidth: 2,
      priceLineVisible: false,
      title: "EMA 20",
    });
    const ema50Series = chart.addSeries(LineSeries, {
      color: "#9a5b00",
      lineWidth: 2,
      priceLineVisible: false,
      title: "EMA 50",
    });
    const trendlineSeries = chart.addSeries(LineSeries, {
      color: "#111713",
      lineStyle: LineStyle.Dashed,
      lineWidth: 2,
      priceLineVisible: false,
      title: "Support",
    });

    candleSeries.setData(model.candles);
    volumeSeries.setData(model.volume);
    ema20Series.setData(model.ema20);
    ema50Series.setData(model.ema50);
    trendlineSeries.setData(model.trendline);
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        bottom: 0,
        top: 0.78,
      },
    });
    createSeriesMarkers(candleSeries, model.markers);

    if (model.signal.buyZoneLow) {
      candleSeries.createPriceLine({
        axisLabelVisible: true,
        color: "#2f6690",
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        price: model.signal.buyZoneLow,
        title: "Zone low",
      });
    }

    if (model.signal.buyZoneHigh) {
      candleSeries.createPriceLine({
        axisLabelVisible: true,
        color: "#2f6690",
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        price: model.signal.buyZoneHigh,
        title: "Zone high",
      });
    }

    if (model.signal.entry) {
      candleSeries.createPriceLine({
        axisLabelVisible: true,
        color: "#157a5a",
        lineStyle: LineStyle.Solid,
        lineWidth: 2,
        price: model.signal.entry,
        title: "Entry",
      });
    }

    if (model.signal.stop) {
      candleSeries.createPriceLine({
        axisLabelVisible: true,
        color: "#a43124",
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        price: model.signal.stop,
        title: "Stop",
      });
    }

    if (model.signal.target) {
      candleSeries.createPriceLine({
        axisLabelVisible: true,
        color: "#0f6047",
        lineStyle: LineStyle.Dashed,
        lineWidth: 2,
        price: model.signal.target,
        title: "Target",
      });
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [model]);

  return (
    <div
      className="tradingview-chart-host"
      ref={containerRef}
      role="img"
      aria-label="TradingView Lightweight Charts candlestick strategy chart"
    />
  );
}

function StrategyPanel({ signal }: { signal: TrendStrategySignal }) {
  const passedCount = signal.confirmations.filter(
    (confirmation) => confirmation.passed,
  ).length;

  return (
    <aside className="strategy-panel" aria-label="Strategy signal">
      <div className={`strategy-status ${signal.status}`}>
        <p className="panel-label">Strategy</p>
        <strong>{statusLabels[signal.status]}</strong>
        <small>
          {passedCount} / {signal.confirmations.length} checks passed
        </small>
      </div>

      <div className="strategy-metrics">
        <div>
          <span>Buy zone</span>
          <strong>
            {signal.buyZoneLow && signal.buyZoneHigh
              ? `${formatCurrency(signal.buyZoneLow)} - ${formatCurrency(
                  signal.buyZoneHigh,
                )}`
              : missingValue}
          </strong>
        </div>
        <div>
          <span>Entry</span>
          <strong>{formatCurrency(signal.entry)}</strong>
        </div>
        <div>
          <span>Stop</span>
          <strong>{formatCurrency(signal.stop)}</strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{formatCurrency(signal.target)}</strong>
        </div>
        <div>
          <span>Risk/share</span>
          <strong>{formatCurrency(signal.riskPerShare)}</strong>
        </div>
        <div>
          <span>Reward/risk</span>
          <strong>
            {signal.rewardRiskRatio
              ? `${formatNumber(signal.rewardRiskRatio)}:1`
              : missingValue}
          </strong>
        </div>
        <div>
          <span>Trendline</span>
          <strong>{formatCurrency(signal.trendline.currentPrice)}</strong>
        </div>
        <div>
          <span>ATR 14</span>
          <strong>{formatCurrency(signal.atr)}</strong>
        </div>
      </div>

      <ul className="strategy-checks">
        {signal.confirmations.map((confirmation) => (
          <li
            className={confirmation.passed ? "is-pass" : "is-fail"}
            key={confirmation.description}
          >
            <span>{confirmation.passed ? "Pass" : "Fail"}</span>
            <strong>{confirmation.description}</strong>
          </li>
        ))}
      </ul>

      <div className="strategy-formula">
        <strong>Calculation</strong>
        <small>
          Entry = projected trendline + 0.25 ATR. Stop = recent low - 0.5 ATR.
          Target = entry + 2R.
        </small>
      </div>
    </aside>
  );
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
  const chartModel = useMemo(() => buildLightweightChartModel(data), [data]);

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
              <p className="panel-label">OHLCV strategy</p>
              <h2>
                {data.symbol} {timeframeLabels[data.timeframe]}
              </h2>
            </div>
            <span>{formatDateTime(data.fetchedAt)}</span>
          </div>
          <div className="strategy-chart-layout">
            <div className="chart-shell">
              <PriceChartCanvas model={chartModel} />
            </div>
            <StrategyPanel signal={chartModel.signal} />
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
