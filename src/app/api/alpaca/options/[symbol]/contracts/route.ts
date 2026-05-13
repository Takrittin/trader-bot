import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import type { AlpacaOptionContract } from "@/lib/alpaca/types";
import { getTomorrowIsoDate } from "@/features/options/date";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import type {
  OptionChainErrorResponse,
  OptionContractsResponse,
} from "@/features/options/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

function toContractSummary(
  contract: AlpacaOptionContract,
): OptionContractsResponse["contracts"][number] {
  return {
    expirationDate: contract.expiration_date,
    openInterest: contract.open_interest ?? null,
    strikePrice: contract.strike_price,
    symbol: contract.symbol,
    type: contract.type,
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
): NextResponse<OptionChainErrorResponse> {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<OptionContractsResponse | OptionChainErrorResponse>> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    return jsonError("Invalid underlying symbol.", 400);
  }

  try {
    const client = createAlpacaPaperClient();
    const response = await client.getOptionContracts({
      expirationDateGte: getTomorrowIsoDate(),
      limit: 1000,
      status: "active",
      underlyingSymbols: [symbol],
    });

    return NextResponse.json({
      contracts: response.option_contracts.map(toContractSummary),
      fetchedAt: new Date().toISOString(),
      nextPageToken: response.page_token ?? null,
      underlyingSymbol: symbol,
    });
  } catch (error) {
    if (isEnvValidationError(error)) {
      return jsonError(
        "Alpaca paper credentials are not configured correctly. Check .env.local.",
        500,
      );
    }

    if (error instanceof AlpacaClientError) {
      console.error("Alpaca option contracts request failed", {
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError(
        "Unable to fetch Alpaca option contracts from the paper API.",
        error.status,
      );
    }

    console.error("Unexpected option contracts error", error);

    return jsonError("Unable to load option contracts.", 500);
  }
}
