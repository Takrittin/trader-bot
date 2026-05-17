import "server-only";

import type {
  AlpacaOptionContract,
  AlpacaOptionSnapshot,
} from "@/lib/alpaca/types";
import { calculateDte } from "@/features/options/date";
import { evaluateVerticalSpreadRisk } from "@/features/risk/vertical-spread-risk";
import type { VerticalSpreadRiskProfile } from "@/features/risk/types";
import type {
  VerticalSpreadCandidate,
  VerticalSpreadExplanation,
  VerticalSpreadLeg,
  VerticalSpreadScoreGrade,
  VerticalSpreadStrategy,
} from "@/features/spreads/types";

type QuotedContract = {
  ask: number;
  bid: number;
  delta: number | null;
  expirationDate: string;
  maxBidAskWidth: number;
  openInterest: string | null;
  strike: number;
  symbol: string;
  theta: number | null;
  type: "call" | "put";
};

type GenerateVerticalSpreadCandidatesInput = {
  contracts: AlpacaOptionContract[];
  limit: number;
  riskProfile: VerticalSpreadRiskProfile;
  snapshots: Record<string, AlpacaOptionSnapshot>;
};

export type GenerateVerticalSpreadCandidatesResult = {
  candidates: VerticalSpreadCandidate[];
  rejectedCount: number;
  scannedSpreads: number;
};

function toFiniteNumber(value: number | string | undefined | null): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toQuotedContract(
  contract: AlpacaOptionContract,
  snapshot: AlpacaOptionSnapshot | undefined,
): QuotedContract | null {
  const quote = snapshot?.latestQuote ?? snapshot?.latest_quote ?? null;
  const bid = toFiniteNumber(quote?.bp ?? quote?.bid_price);
  const ask = toFiniteNumber(quote?.ap ?? quote?.ask_price);
  const strike = toFiniteNumber(contract.strike_price);

  if (bid === null || ask === null || strike === null || bid < 0 || ask <= 0) {
    return null;
  }

  if (ask < bid) {
    return null;
  }

  return {
    ask,
    bid,
    delta: toFiniteNumber(snapshot?.greeks?.delta),
    expirationDate: contract.expiration_date,
    maxBidAskWidth: ask - bid,
    openInterest: contract.open_interest ?? null,
    strike,
    symbol: contract.symbol,
    theta: toFiniteNumber(snapshot?.greeks?.theta),
    type: contract.type,
  };
}

function toLeg(contract: QuotedContract, action: "buy" | "sell"): VerticalSpreadLeg {
  return {
    action,
    ask: contract.ask,
    bid: contract.bid,
    delta: contract.delta,
    openInterest: contract.openInterest,
    strike: contract.strike,
    symbol: contract.symbol,
    theta: contract.theta,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function toOpenInterestNumber(value: string | null): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getMinOpenInterest(
  lower: QuotedContract,
  upper: QuotedContract,
): number | null {
  const lowerOpenInterest = toOpenInterestNumber(lower.openInterest);
  const upperOpenInterest = toOpenInterestNumber(upper.openInterest);

  if (lowerOpenInterest === null || upperOpenInterest === null) {
    return null;
  }

  return Math.min(lowerOpenInterest, upperOpenInterest);
}

function getRewardRiskRatio(maxProfit: number, maxLoss: number): number {
  return Math.round((maxProfit / maxLoss) * 100) / 100;
}

function getScoreGrade(score: number): VerticalSpreadScoreGrade {
  if (score >= 80) {
    return "A";
  }

  if (score >= 65) {
    return "B";
  }

  if (score >= 50) {
    return "C";
  }

  return "D";
}

function buildScoring({
  dte,
  maxBidAskWidth,
  maxLoss,
  maxProfit,
  minOpenInterest,
  riskProfile,
}: {
  dte: number;
  maxBidAskWidth: number;
  maxLoss: number;
  maxProfit: number;
  minOpenInterest: number | null;
  riskProfile: VerticalSpreadRiskProfile;
}): VerticalSpreadExplanation {
  const rewardRiskRatio = getRewardRiskRatio(maxProfit, maxLoss);
  const liquidityScore = Math.max(
    0,
    Math.min(30, (1 - maxBidAskWidth / riskProfile.maxBidAskWidth) * 30),
  );
  const rewardRiskScore = Math.min(30, rewardRiskRatio * 7.5);
  const openInterestScore =
    minOpenInterest === null
      ? 0
      : Math.min(20, (minOpenInterest / riskProfile.minOpenInterest) * 20);
  const dteMidpoint = (riskProfile.minDte + riskProfile.maxDte) / 2;
  const dteSpan = Math.max(1, riskProfile.maxDte - riskProfile.minDte);
  const dteScore = Math.max(
    0,
    Math.min(20, 20 - (Math.abs(dte - dteMidpoint) / dteSpan) * 20),
  );
  const scoreParts = {
    dte: Math.round(dteScore),
    liquidity: Math.round(liquidityScore),
    openInterest: Math.round(openInterestScore),
    rewardRisk: Math.round(rewardRiskScore),
  };
  const score = Math.min(
    100,
    scoreParts.dte +
      scoreParts.liquidity +
      scoreParts.openInterest +
      scoreParts.rewardRisk,
  );
  const grade = getScoreGrade(score);
  const points = [
    `Reward/risk is ${rewardRiskRatio.toFixed(2)}:1.`,
    `Widest leg bid/ask is ${roundCurrency(maxBidAskWidth).toFixed(2)}.`,
    minOpenInterest === null
      ? "Open interest is not available on one or more legs."
      : `Minimum leg open interest is ${minOpenInterest}.`,
    `Expiration is ${dte} DTE.`,
  ];

  return {
    grade,
    points,
    score,
    scoreParts,
  };
}

function calculateBreakeven(
  strategy: VerticalSpreadStrategy,
  longLeg: QuotedContract,
  shortLeg: QuotedContract,
  netDebit: number | null,
  netCredit: number | null,
): number {
  if (strategy === "bull_call_debit") {
    return roundCurrency(longLeg.strike + (netDebit ?? 0));
  }

  if (strategy === "bear_put_debit") {
    return roundCurrency(longLeg.strike - (netDebit ?? 0));
  }

  if (strategy === "bear_call_credit") {
    return roundCurrency(shortLeg.strike + (netCredit ?? 0));
  }

  return roundCurrency(shortLeg.strike - (netCredit ?? 0));
}

function buildCandidate(
  strategy: VerticalSpreadStrategy,
  lower: QuotedContract,
  upper: QuotedContract,
  riskProfile: VerticalSpreadRiskProfile,
): VerticalSpreadCandidate | null {
  const width = roundCurrency(upper.strike - lower.strike);

  if (width <= 0) {
    return null;
  }

  const isDebit =
    strategy === "bull_call_debit" || strategy === "bear_put_debit";
  const isCall = strategy === "bull_call_debit" || strategy === "bear_call_credit";
  const longLeg = isCall
    ? strategy === "bull_call_debit"
      ? lower
      : upper
    : strategy === "bear_put_debit"
      ? upper
      : lower;
  const shortLeg = longLeg.symbol === lower.symbol ? upper : lower;
  const debit = isDebit ? roundCurrency(longLeg.ask - shortLeg.bid) : null;
  const credit = isDebit ? null : roundCurrency(shortLeg.bid - longLeg.ask);

  if ((debit !== null && debit <= 0) || (credit !== null && credit <= 0)) {
    return null;
  }

  const maxLoss = roundCurrency(
    debit !== null ? debit * 100 : (width - (credit ?? 0)) * 100,
  );
  const maxProfit = roundCurrency(
    debit !== null ? (width - debit) * 100 : (credit ?? 0) * 100,
  );

  if (maxLoss <= 0 || maxProfit <= 0) {
    return null;
  }

  const dte = calculateDte(lower.expirationDate);
  const maxBidAskWidth = roundCurrency(
    Math.max(lower.maxBidAskWidth, upper.maxBidAskWidth),
  );
  const minOpenInterest = getMinOpenInterest(lower, upper);
  const riskChecks = evaluateVerticalSpreadRisk(
    { dte, maxBidAskWidth, maxLoss, minOpenInterest },
    riskProfile,
  );
  const scoring = buildScoring({
    dte,
    maxBidAskWidth,
    maxLoss,
    maxProfit,
    minOpenInterest,
    riskProfile,
  });

  return {
    ask: longLeg.ask,
    breakeven: calculateBreakeven(strategy, longLeg, shortLeg, debit, credit),
    bid: shortLeg.bid,
    dte,
    expirationDate: lower.expirationDate,
    id: [
      strategy,
      lower.expirationDate,
      longLeg.symbol,
      shortLeg.symbol,
    ].join(":"),
    legs: [toLeg(longLeg, "buy"), toLeg(shortLeg, "sell")],
    maxBidAskWidth,
    maxLoss,
    maxProfit,
    minOpenInterest,
    netCredit: credit,
    netDebit: debit,
    rewardRiskRatio: getRewardRiskRatio(maxProfit, maxLoss),
    riskChecks,
    score: scoring.score,
    scoreGrade: scoring.grade,
    scoring,
    strategy,
    type: lower.type,
    width,
  };
}

function groupByExpirationAndType(
  contracts: QuotedContract[],
): Map<string, QuotedContract[]> {
  const groups = new Map<string, QuotedContract[]>();

  for (const contract of contracts) {
    const key = `${contract.expirationDate}:${contract.type}`;
    const group = groups.get(key) ?? [];

    group.push(contract);
    groups.set(key, group);
  }

  return groups;
}

function sortCandidate(
  left: VerticalSpreadCandidate,
  right: VerticalSpreadCandidate,
): number {
  const scoreSort = right.score - left.score;

  if (scoreSort !== 0) {
    return scoreSort;
  }

  const expirationSort = left.expirationDate.localeCompare(right.expirationDate);

  if (expirationSort !== 0) {
    return expirationSort;
  }

  const lossSort = left.maxLoss - right.maxLoss;

  if (lossSort !== 0) {
    return lossSort;
  }

  return right.maxProfit - left.maxProfit;
}

export function generateVerticalSpreadCandidates({
  contracts,
  limit,
  riskProfile,
  snapshots,
}: GenerateVerticalSpreadCandidatesInput): GenerateVerticalSpreadCandidatesResult {
  const quotedContracts = contracts
    .map((contract) => toQuotedContract(contract, snapshots[contract.symbol]))
    .filter((contract): contract is QuotedContract => contract !== null);
  const groups = groupByExpirationAndType(quotedContracts);
  const passingCandidates: VerticalSpreadCandidate[] = [];
  let rejectedCount = 0;
  let scannedSpreads = 0;

  for (const group of groups.values()) {
    const sortedGroup = group.toSorted((left, right) => left.strike - right.strike);

    for (let index = 0; index < sortedGroup.length - 1; index += 1) {
      const lower = sortedGroup[index];
      const upper = sortedGroup[index + 1];
      const strategies: VerticalSpreadStrategy[] =
        lower.type === "call"
          ? ["bull_call_debit", "bear_call_credit"]
          : ["bear_put_debit", "bull_put_credit"];

      for (const strategy of strategies) {
        const candidate = buildCandidate(strategy, lower, upper, riskProfile);

        if (!candidate) {
          continue;
        }

        scannedSpreads += 1;

        if (candidate.riskChecks.every((check) => check.passed)) {
          passingCandidates.push(candidate);
        } else {
          rejectedCount += 1;
        }
      }
    }
  }

  return {
    candidates: passingCandidates.toSorted(sortCandidate).slice(0, limit),
    rejectedCount,
    scannedSpreads,
  };
}
