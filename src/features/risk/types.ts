export type RiskCheckName =
  | "max_loss"
  | "expiration_range"
  | "bid_ask_width"
  | "max_trades_per_day";

export type RiskCheckResult = {
  label: string;
  limit: string;
  name: RiskCheckName;
  passed: boolean;
  value: string;
};

export type VerticalSpreadRiskProfile = {
  currentTradesToday: number;
  maxBidAskWidth: number;
  maxDte: number;
  maxLoss: number;
  maxTradesPerDay: number;
  minDte: number;
};

export const defaultVerticalSpreadRiskProfile: VerticalSpreadRiskProfile = {
  currentTradesToday: 0,
  maxBidAskWidth: 0.5,
  maxDte: 45,
  maxLoss: 500,
  maxTradesPerDay: 3,
  minDte: 1,
};
