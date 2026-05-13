import "server-only";

import type {
  RiskCheckResult,
  VerticalSpreadRiskProfile,
} from "@/features/risk/types";

type RiskCandidateInput = {
  dte: number;
  maxBidAskWidth: number;
  maxLoss: number;
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
  ];
}
