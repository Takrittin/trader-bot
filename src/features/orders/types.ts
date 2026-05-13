import type { AlpacaMlegLimitOrderRequest, AlpacaOrder } from "@/lib/alpaca/types";
import type { RiskCheckResult, VerticalSpreadRiskProfile } from "@/features/risk/types";
import type { VerticalSpreadCandidate } from "@/features/spreads/types";

export const PAPER_ORDER_CONFIRMATION_PHRASE = "SUBMIT PAPER ORDER";

export type PaperMlegOrderPreviewRequest = {
  candidateId: string;
  limit?: number;
  quantity: number;
  riskProfile: Omit<VerticalSpreadRiskProfile, "currentTradesToday">;
};

export type PaperMlegOrderPreview = {
  candidate: VerticalSpreadCandidate;
  estimatedMaxLoss: number;
  estimatedMaxProfit: number;
  order: AlpacaMlegLimitOrderRequest;
  quantity: number;
  riskChecks: RiskCheckResult[];
  riskProfile: VerticalSpreadRiskProfile;
  submissionsDisabled: boolean;
};

export type PaperMlegOrderPreviewResponse = {
  fetchedAt: string;
  preview: PaperMlegOrderPreview;
  underlyingSymbol: string;
};

export type PaperMlegOrderSubmitRequest = PaperMlegOrderPreviewRequest & {
  confirmation: string;
};

export type PaperMlegOrderSubmitResponse = {
  order: AlpacaOrder;
  preview: PaperMlegOrderPreview;
  submittedAt: string;
  underlyingSymbol: string;
};

export type PaperMlegOrderErrorResponse = {
  error: string;
};
