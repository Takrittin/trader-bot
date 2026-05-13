export const ALPACA_PAPER_TRADING_BASE_URL =
  "https://paper-api.alpaca.markets";
export const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
export const ALPACA_PAPER_TRADING_HOST = "paper-api.alpaca.markets";

export function isPaperTradingBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === ALPACA_PAPER_TRADING_HOST &&
      (url.pathname === "" || url.pathname === "/")
    );
  } catch {
    return false;
  }
}

export function assertPaperTradingBaseUrl(value: string): void {
  if (!isPaperTradingBaseUrl(value)) {
    throw new Error(
      "Alpaca live trading is disabled. Use https://paper-api.alpaca.markets.",
    );
  }
}
