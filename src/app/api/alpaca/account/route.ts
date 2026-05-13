import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import type { AlpacaAccount } from "@/lib/alpaca/types";
import type {
  AccountDashboardErrorResponse,
  AccountDashboardResponse,
} from "@/features/account/types";

export const dynamic = "force-dynamic";

function toDashboardAccount(
  account: AlpacaAccount,
): AccountDashboardResponse["account"] {
  return {
    accountNumber: account.account_number,
    status: account.status,
    currency: account.currency,
    cash: account.cash,
    buyingPower: account.buying_power,
    portfolioValue: account.portfolio_value,
    patternDayTrader: account.pattern_day_trader,
    tradingBlocked: account.trading_blocked,
    transfersBlocked: account.transfers_blocked,
    accountBlocked: account.account_blocked,
    optionsApprovedLevel: account.options_approved_level ?? null,
    optionsTradingLevel: account.options_trading_level ?? null,
    createdAt: account.created_at,
  };
}

function isEnvValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Invalid server environment:")
  );
}

function jsonError(
  error: string,
  status: number,
): NextResponse<AccountDashboardErrorResponse> {
  return NextResponse.json({ error }, { status });
}

export async function GET(): Promise<
  NextResponse<AccountDashboardResponse | AccountDashboardErrorResponse>
> {
  try {
    const client = createAlpacaPaperClient();
    const account = await client.getAccount();

    return NextResponse.json({
      account: toDashboardAccount(account),
      fetchedAt: new Date().toISOString(),
      tradingMode: "paper",
    });
  } catch (error) {
    if (isEnvValidationError(error)) {
      return jsonError(
        "Alpaca paper credentials are not configured correctly. Check .env.local.",
        500,
      );
    }

    if (error instanceof AlpacaClientError) {
      console.error("Alpaca account request failed", {
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError(
        "Unable to fetch Alpaca account information from the paper API.",
        error.status,
      );
    }

    console.error("Unexpected account dashboard error", error);

    return jsonError("Unable to load the account dashboard.", 500);
  }
}
