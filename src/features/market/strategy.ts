import type { StockBarSummary } from "@/features/market/types";

export type StrategyPivot = {
  index: number;
  price: number;
  timestamp: string;
};

export type StrategyConfirmation = {
  description: string;
  passed: boolean;
};

export type TrendStrategySignal = {
  atr: number | null;
  averageVolume: number | null;
  buyZoneHigh: number | null;
  buyZoneLow: number | null;
  confirmations: StrategyConfirmation[];
  entry: number | null;
  ema20: number | null;
  ema50: number | null;
  lastClose: number | null;
  lastVolume: number | null;
  pivotHigh: StrategyPivot | null;
  pivotLow: StrategyPivot | null;
  rewardRiskRatio: number | null;
  riskPerShare: number | null;
  setup: "bullish" | "neutral";
  status: "ready" | "watch" | "not_ready";
  stop: number | null;
  target: number | null;
  trendline: {
    currentPrice: number | null;
    first: StrategyPivot | null;
    second: StrategyPivot | null;
    slopePerBar: number | null;
  };
};

const atrPeriod = 14;
const fastEmaPeriod = 20;
const slowEmaPeriod = 50;
const volumePeriod = 20;
const pivotWindow = 2;

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateEma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (const value of values.slice(period)) {
    ema = value * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

function calculateAtr(bars: StockBarSummary[], period: number): number | null {
  if (bars.length <= period) {
    return null;
  }

  const trueRanges: number[] = [];

  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index];
    const previousClose = bars[index - 1].close;

    trueRanges.push(
      Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - previousClose),
        Math.abs(bar.low - previousClose),
      ),
    );
  }

  return average(trueRanges.slice(-period));
}

function findPivotLows(bars: StockBarSummary[]): StrategyPivot[] {
  const pivots: StrategyPivot[] = [];

  for (
    let index = pivotWindow;
    index < bars.length - pivotWindow;
    index += 1
  ) {
    const currentLow = bars[index].low;
    const nearbyBars = bars.slice(index - pivotWindow, index + pivotWindow + 1);
    const isPivot = nearbyBars.every((bar) => currentLow <= bar.low);

    if (isPivot) {
      pivots.push({
        index,
        price: currentLow,
        timestamp: bars[index].timestamp,
      });
    }
  }

  return pivots;
}

function findRecentPivotHigh(bars: StockBarSummary[]): StrategyPivot | null {
  for (
    let index = bars.length - pivotWindow - 1;
    index >= pivotWindow;
    index -= 1
  ) {
    const currentHigh = bars[index].high;
    const nearbyBars = bars.slice(index - pivotWindow, index + pivotWindow + 1);
    const isPivot = nearbyBars.every((bar) => currentHigh >= bar.high);

    if (isPivot) {
      return {
        index,
        price: currentHigh,
        timestamp: bars[index].timestamp,
      };
    }
  }

  return null;
}

function findRisingPivotPair(pivots: StrategyPivot[]) {
  for (let right = pivots.length - 1; right > 0; right -= 1) {
    const second = pivots[right];

    for (let left = right - 1; left >= 0; left -= 1) {
      const first = pivots[left];

      if (second.index > first.index && second.price > first.price) {
        return { first, second };
      }
    }
  }

  return {
    first: null,
    second: null,
  };
}

function emptySignal(bars: StockBarSummary[]): TrendStrategySignal {
  const last = bars.at(-1) ?? null;

  return {
    atr: null,
    averageVolume: null,
    buyZoneHigh: null,
    buyZoneLow: null,
    confirmations: [
      {
        description: "Need more bars to calculate trend, ATR, and moving averages.",
        passed: false,
      },
    ],
    entry: null,
    ema20: null,
    ema50: null,
    lastClose: last?.close ?? null,
    lastVolume: last?.volume ?? null,
    pivotHigh: null,
    pivotLow: null,
    rewardRiskRatio: null,
    riskPerShare: null,
    setup: "neutral",
    status: "not_ready",
    stop: null,
    target: null,
    trendline: {
      currentPrice: null,
      first: null,
      second: null,
      slopePerBar: null,
    },
  };
}

export function calculateTrendStrategy(
  bars: StockBarSummary[],
): TrendStrategySignal {
  if (bars.length < slowEmaPeriod + pivotWindow * 2) {
    return emptySignal(bars);
  }

  const closes = bars.map((bar) => bar.close);
  const ema20 = calculateEma(closes, fastEmaPeriod);
  const ema50 = calculateEma(closes, slowEmaPeriod);
  const atr = calculateAtr(bars, atrPeriod);
  const last = bars.at(-1) ?? null;
  const averageVolume = average(
    bars.slice(-volumePeriod).map((bar) => bar.volume),
  );
  const pivots = findPivotLows(bars);
  const { first, second } = findRisingPivotPair(pivots);
  const pivotHigh = findRecentPivotHigh(bars);

  if (!last || !first || !second || !ema20 || !ema50 || !atr || !averageVolume) {
    return {
      ...emptySignal(bars),
      atr,
      averageVolume,
      ema20,
      ema50,
      pivotHigh,
      pivotLow: second,
    };
  }

  const slopePerBar = (second.price - first.price) / (second.index - first.index);
  const currentTrendlinePrice =
    second.price + slopePerBar * (bars.length - 1 - second.index);
  const buffer = atr * 0.25;
  const entry = currentTrendlinePrice + buffer;
  const buyZoneLow = currentTrendlinePrice - buffer;
  const buyZoneHigh = currentTrendlinePrice + buffer;
  const stopReference = Math.min(second.price, last.low);
  const stop = stopReference - atr * 0.5;
  const riskPerShare = Math.max(entry - stop, 0);
  const target = riskPerShare > 0 ? entry + riskPerShare * 2 : null;
  const rewardRiskRatio =
    target && riskPerShare > 0 ? (target - entry) / riskPerShare : null;
  const distanceFromTrendline = last.close - currentTrendlinePrice;
  const nearBuyZone = Math.abs(distanceFromTrendline) <= atr * 1.5;
  const confirmations: StrategyConfirmation[] = [
    {
      description: "Price is above the 20 EMA.",
      passed: last.close > ema20,
    },
    {
      description: "20 EMA is above the 50 EMA.",
      passed: ema20 > ema50,
    },
    {
      description: "Recent pivot lows are rising.",
      passed: slopePerBar > 0,
    },
    {
      description: "Price is close enough to the projected support trendline.",
      passed: nearBuyZone,
    },
    {
      description: "Latest volume is at least 60% of the recent average.",
      passed: last.volume >= averageVolume * 0.6,
    },
    {
      description: "Reward/risk target is at least 2:1.",
      passed: (rewardRiskRatio ?? 0) >= 2,
    },
  ];
  const passedCount = confirmations.filter((confirmation) => confirmation.passed)
    .length;
  const setup = passedCount >= 4 ? "bullish" : "neutral";
  const status =
    setup === "bullish" && nearBuyZone
      ? "ready"
      : setup === "bullish"
        ? "watch"
        : "not_ready";

  return {
    atr: roundPrice(atr),
    averageVolume,
    buyZoneHigh: roundPrice(buyZoneHigh),
    buyZoneLow: roundPrice(buyZoneLow),
    confirmations,
    entry: roundPrice(entry),
    ema20: roundPrice(ema20),
    ema50: roundPrice(ema50),
    lastClose: last.close,
    lastVolume: last.volume,
    pivotHigh,
    pivotLow: second,
    rewardRiskRatio,
    riskPerShare: roundPrice(riskPerShare),
    setup,
    status,
    stop: roundPrice(stop),
    target: target ? roundPrice(target) : null,
    trendline: {
      currentPrice: roundPrice(currentTrendlinePrice),
      first,
      second,
      slopePerBar,
    },
  };
}
