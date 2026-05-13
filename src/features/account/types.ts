export type AccountDashboardAccount = {
  accountNumber: string;
  status: string;
  currency: string;
  cash: string;
  buyingPower: string;
  portfolioValue: string;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  transfersBlocked: boolean;
  accountBlocked: boolean;
  optionsApprovedLevel: number | null;
  optionsTradingLevel: number | null;
  createdAt: string;
};

export type AccountDashboardResponse = {
  account: AccountDashboardAccount;
  fetchedAt: string;
  tradingMode: "paper";
};

export type AccountDashboardErrorResponse = {
  error: string;
};
