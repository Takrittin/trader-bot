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

export type VerticalSpreadCandidate = {
  ask: number;
  bid: number;
  dte: number;
  expirationDate: string;
  id: string;
  legs: [VerticalSpreadLeg, VerticalSpreadLeg];
  maxBidAskWidth: number;
  maxLoss: number;
  maxProfit: number;
  netCredit: number | null;
  netDebit: number | null;
  riskChecks: RiskCheckResult[];
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
