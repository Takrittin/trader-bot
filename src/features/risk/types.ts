export type RiskCheckName =
  | "max_loss"
  | "expiration_range"
  | "bid_ask_width"
  | "max_trades_per_day"
  | "max_daily_risk"
  | "max_open_trades"
  | "max_trades_per_symbol"
  | "min_open_interest";

export type RiskCheckResult = {
  label: string;
  limit: string;
  name: RiskCheckName;
  passed: boolean;
  value: string;
};

export type VerticalSpreadRiskProfile = {
  currentDailyRisk: number;
  currentOpenTrades: number;
  currentSymbolTradesToday: number;
  currentTradesToday: number;
  maxBidAskWidth: number;
  maxDailyRisk: number;
  maxDte: number;
  maxLoss: number;
  maxOpenTrades: number;
  maxTradesPerDay: number;
  maxTradesPerSymbol: number;
  minOpenInterest: number;
  minDte: number;
};

export type ConfigurableVerticalSpreadRiskProfile = Omit<
  VerticalSpreadRiskProfile,
  | "currentDailyRisk"
  | "currentOpenTrades"
  | "currentSymbolTradesToday"
  | "currentTradesToday"
>;

export const defaultVerticalSpreadRiskProfile: VerticalSpreadRiskProfile = {
  currentDailyRisk: 0,
  currentOpenTrades: 0,
  currentSymbolTradesToday: 0,
  currentTradesToday: 0,
  maxBidAskWidth: 0.5,
  maxDailyRisk: 1_500,
  maxDte: 45,
  maxLoss: 500,
  maxOpenTrades: 3,
  maxTradesPerDay: 3,
  maxTradesPerSymbol: 2,
  minOpenInterest: 10,
  minDte: 1,
};
