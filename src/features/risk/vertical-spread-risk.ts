import "server-only";

import type {
  RiskCheckResult,
  VerticalSpreadRiskProfile,
} from "@/features/risk/types";

type RiskCandidateInput = {
  dte: number;
  maxBidAskWidth: number;
  maxLoss: number;
  minOpenInterest: number | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function evaluateVerticalSpreadRisk(
  candidate: RiskCandidateInput,
  profile: VerticalSpreadRiskProfile,
): RiskCheckResult[] {
  return [
    {
      label: "Max loss",
      limit: `<= ${formatCurrency(profile.maxLoss)}`,
      name: "max_loss",
      passed: candidate.maxLoss <= profile.maxLoss,
      value: formatCurrency(candidate.maxLoss),
    },
    {
      label: "Expiration range",
      limit: `${profile.minDte}-${profile.maxDte} DTE`,
      name: "expiration_range",
      passed: candidate.dte >= profile.minDte && candidate.dte <= profile.maxDte,
      value: `${candidate.dte} DTE`,
    },
    {
      label: "Bid/ask width",
      limit: `<= ${formatCurrency(profile.maxBidAskWidth)}`,
      name: "bid_ask_width",
      passed: candidate.maxBidAskWidth <= profile.maxBidAskWidth,
      value: formatCurrency(candidate.maxBidAskWidth),
    },
    {
      label: "Trades today",
      limit: `< ${formatNumber(profile.maxTradesPerDay)}`,
      name: "max_trades_per_day",
      passed: profile.currentTradesToday < profile.maxTradesPerDay,
      value: formatNumber(profile.currentTradesToday),
    },
    {
      label: "Daily risk",
      limit: `<= ${formatCurrency(profile.maxDailyRisk)}`,
      name: "max_daily_risk",
      passed: profile.currentDailyRisk + candidate.maxLoss <= profile.maxDailyRisk,
      value: formatCurrency(profile.currentDailyRisk + candidate.maxLoss),
    },
    {
      label: "Open trades",
      limit: `< ${formatNumber(profile.maxOpenTrades)}`,
      name: "max_open_trades",
      passed: profile.currentOpenTrades < profile.maxOpenTrades,
      value: formatNumber(profile.currentOpenTrades),
    },
    {
      label: "Symbol trades",
      limit: `< ${formatNumber(profile.maxTradesPerSymbol)}`,
      name: "max_trades_per_symbol",
      passed: profile.currentSymbolTradesToday < profile.maxTradesPerSymbol,
      value: formatNumber(profile.currentSymbolTradesToday),
    },
    {
      label: "Open interest",
      limit: `>= ${formatNumber(profile.minOpenInterest)}`,
      name: "min_open_interest",
      passed:
        candidate.minOpenInterest !== null &&
        candidate.minOpenInterest >= profile.minOpenInterest,
      value:
        candidate.minOpenInterest === null
          ? "Not available"
          : formatNumber(candidate.minOpenInterest),
    },
  ];
}
