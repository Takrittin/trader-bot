export type AlpacaAccount = {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  shorting_enabled?: boolean;
  options_approved_level?: number;
  options_trading_level?: number;
};

export type AlpacaClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

export type AlpacaPosition = {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: "long" | "short";
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
};

export type AlpacaOptionType = "call" | "put";

export type AlpacaOptionContract = {
  id: string;
  symbol: string;
  name: string;
  status: "active" | "inactive";
  tradable: boolean;
  expiration_date: string;
  root_symbol: string;
  underlying_symbol: string;
  underlying_asset_id: string;
  type: AlpacaOptionType;
  style: "american" | "european";
  strike_price: string;
  size: string;
  open_interest?: string | null;
  open_interest_date?: string | null;
  close_price?: string | null;
  close_price_date?: string | null;
};

export type AlpacaOptionContractsResponse = {
  option_contracts: AlpacaOptionContract[];
  page_token?: string;
  limit?: number;
};

export type AlpacaOptionQuote = {
  ap?: number;
  ask_price?: number;
  bp?: number;
  bid_price?: number;
};

export type AlpacaOptionGreeks = {
  delta?: number;
  theta?: number;
};

export type AlpacaOptionSnapshot = {
  greeks?: AlpacaOptionGreeks | null;
  latestQuote?: AlpacaOptionQuote | null;
  latest_quote?: AlpacaOptionQuote | null;
};

export type AlpacaOptionSnapshotsResponse = {
  snapshots: Record<string, AlpacaOptionSnapshot>;
  next_page_token?: string;
};

export type AlpacaOrderSide = "buy" | "sell";
export type AlpacaPositionIntent =
  | "buy_to_open"
  | "buy_to_close"
  | "sell_to_open"
  | "sell_to_close";

export type AlpacaMlegOrderLegRequest = {
  position_intent: AlpacaPositionIntent;
  ratio_qty: string;
  side: AlpacaOrderSide;
  symbol: string;
};

export type AlpacaMlegLimitOrderRequest = {
  client_order_id?: string;
  extended_hours: false;
  legs: AlpacaMlegOrderLegRequest[];
  limit_price: string;
  order_class: "mleg";
  qty: string;
  time_in_force: "day";
  type: "limit";
};

export type AlpacaOrder = {
  id: string;
  client_order_id?: string;
  created_at?: string;
  submitted_at?: string;
  status: string;
  order_class?: string;
  qty?: string;
  limit_price?: string;
  legs?: AlpacaOrder[];
};
