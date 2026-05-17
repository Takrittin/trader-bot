import type { RiskCheckResult } from "@/features/risk/types";
import type {
  VerticalSpreadCandidate,
  VerticalSpreadExplanation,
  VerticalSpreadScoreGrade,
  VerticalSpreadStrategy,
} from "@/features/spreads/types";
import type { AlpacaMlegLimitOrderRequest, AlpacaOrder } from "@/lib/alpaca/types";

export type JournalOrderStatus =
  | "accepted"
  | "accepted_for_bidding"
  | "calculated"
  | "canceled"
  | "done_for_day"
  | "expired"
  | "filled"
  | "held"
  | "new"
  | "partially_filled"
  | "pending_cancel"
  | "pending_new"
  | "pending_replace"
  | "rejected"
  | "replaced"
  | "stopped"
  | "suspended"
  | string;

export type JournalOrderRecord = {
  alpacaOrderId: string;
  candidate: VerticalSpreadCandidate;
  candidateId: string;
  clientOrderId: string | null;
  createdAt: string;
  dte: number;
  estimatedMaxLoss: number;
  estimatedMaxProfit: number;
  expirationDate: string;
  id: string;
  limitPrice: number;
  netCredit: number | null;
  netDebit: number | null;
  orderRequest: AlpacaMlegLimitOrderRequest;
  orderResponse: AlpacaOrder;
  quantity: number;
  rewardRiskRatio: number;
  riskChecks: RiskCheckResult[];
  score: number;
  scoreGrade: VerticalSpreadScoreGrade;
  scoring: VerticalSpreadExplanation;
  status: JournalOrderStatus;
  strategy: VerticalSpreadStrategy;
  underlyingSymbol: string;
  updatedAt: string;
};

export type JournalAuditEvent = {
  createdAt: string;
  details: Record<string, unknown>;
  eventType: string;
  id: string;
};

export type JournalRiskUsage = {
  currentDailyRisk: number;
  currentOpenTrades: number;
  currentSymbolTradesToday: number;
  currentTradesToday: number;
};

export type JournalOrderListResponse = {
  fetchedAt: string;
  orders: JournalOrderRecord[];
  summary: {
    averageScore: number;
    openRisk: number;
    openTrades: number;
    totalOrders: number;
    totalRiskLogged: number;
  };
  syncedFromAlpaca: boolean;
};

export type JournalAuditListResponse = {
  events: JournalAuditEvent[];
  fetchedAt: string;
};

export type JournalErrorResponse = {
  error: string;
};
