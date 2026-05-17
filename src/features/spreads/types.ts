import type {
  RiskCheckResult,
  VerticalSpreadRiskProfile,
} from "@/features/risk/types";

export type VerticalSpreadStrategy =
  | "bull_call_debit"
  | "bear_call_credit"
  | "bear_put_debit"
  | "bull_put_credit";

export type VerticalSpreadLeg = {
  action: "buy" | "sell";
  ask: number;
  bid: number;
  delta: number | null;
  openInterest: string | null;
  strike: number;
  symbol: string;
  theta: number | null;
};

export type VerticalSpreadScoreGrade = "A" | "B" | "C" | "D";

export type VerticalSpreadExplanation = {
  grade: VerticalSpreadScoreGrade;
  points: string[];
  score: number;
  scoreParts: {
    dte: number;
    liquidity: number;
    openInterest: number;
    rewardRisk: number;
  };
};

export type VerticalSpreadCandidate = {
  ask: number;
  breakeven: number;
  bid: number;
  dte: number;
  expirationDate: string;
  id: string;
  legs: [VerticalSpreadLeg, VerticalSpreadLeg];
  maxBidAskWidth: number;
  maxLoss: number;
  maxProfit: number;
  minOpenInterest: number | null;
  netCredit: number | null;
  netDebit: number | null;
  rewardRiskRatio: number;
  riskChecks: RiskCheckResult[];
  score: number;
  scoreGrade: VerticalSpreadScoreGrade;
  scoring: VerticalSpreadExplanation;
  strategy: VerticalSpreadStrategy;
  type: "call" | "put";
  width: number;
};

export type VerticalSpreadCandidatesResponse = {
  candidates: VerticalSpreadCandidate[];
  fetchedAt: string;
  rejectedCount: number;
  riskProfile: VerticalSpreadRiskProfile;
  scannedSpreads: number;
  underlyingSymbol: string;
};

export type VerticalSpreadCandidatesErrorResponse = {
  error: string;
};
