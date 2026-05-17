import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import { getIsoDateOffset } from "@/features/options/date";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import {
  defaultVerticalSpreadRiskProfile,
  type VerticalSpreadRiskProfile,
} from "@/features/risk/types";
import { getJournalRiskUsage } from "@/features/journal/database";
import { getTodaysMlegOrderCount } from "@/features/orders/paper-mleg";
import { generateVerticalSpreadCandidates } from "@/features/spreads/generator";
import type {
  VerticalSpreadCandidatesErrorResponse,
  VerticalSpreadCandidatesResponse,
} from "@/features/spreads/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

function parseNumberParam(
  searchParams: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(searchParams.get(name));

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function parseRiskProfile(searchParams: URLSearchParams): {
  limit: number;
  riskProfile: VerticalSpreadRiskProfile;
} {
  const minDte = parseNumberParam(
    searchParams,
    "minDte",
    defaultVerticalSpreadRiskProfile.minDte,
    1,
    365,
  );
  const maxDte = parseNumberParam(
    searchParams,
    "maxDte",
    defaultVerticalSpreadRiskProfile.maxDte,
    minDte,
    365,
  );

  return {
    limit: parseNumberParam(searchParams, "limit", 40, 1, 100),
    riskProfile: {
      currentTradesToday: parseNumberParam(
        searchParams,
        "currentTradesToday",
        defaultVerticalSpreadRiskProfile.currentTradesToday,
        0,
        100,
      ),
      currentDailyRisk: defaultVerticalSpreadRiskProfile.currentDailyRisk,
      currentOpenTrades: defaultVerticalSpreadRiskProfile.currentOpenTrades,
      currentSymbolTradesToday:
        defaultVerticalSpreadRiskProfile.currentSymbolTradesToday,
      maxBidAskWidth: parseNumberParam(
        searchParams,
        "maxBidAskWidth",
        defaultVerticalSpreadRiskProfile.maxBidAskWidth,
        0.01,
        25,
      ),
      maxDailyRisk: parseNumberParam(
        searchParams,
        "maxDailyRisk",
        defaultVerticalSpreadRiskProfile.maxDailyRisk,
        1,
        1_000_000,
      ),
      maxDte,
      maxLoss: parseNumberParam(
        searchParams,
        "maxLoss",
        defaultVerticalSpreadRiskProfile.maxLoss,
        1,
        100_000,
      ),
      maxOpenTrades: parseNumberParam(
        searchParams,
        "maxOpenTrades",
        defaultVerticalSpreadRiskProfile.maxOpenTrades,
        1,
        100,
      ),
      maxTradesPerDay: parseNumberParam(
        searchParams,
        "maxTradesPerDay",
        defaultVerticalSpreadRiskProfile.maxTradesPerDay,
        1,
        100,
      ),
      maxTradesPerSymbol: parseNumberParam(
        searchParams,
        "maxTradesPerSymbol",
        defaultVerticalSpreadRiskProfile.maxTradesPerSymbol,
        1,
        100,
      ),
      minOpenInterest: parseNumberParam(
        searchParams,
        "minOpenInterest",
        defaultVerticalSpreadRiskProfile.minOpenInterest,
        0,
        1_000_000,
      ),
      minDte,
    },
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
): NextResponse<VerticalSpreadCandidatesErrorResponse> {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<
  NextResponse<
    VerticalSpreadCandidatesResponse | VerticalSpreadCandidatesErrorResponse
  >
> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    return jsonError("Invalid underlying symbol.", 400);
  }

  const { limit, riskProfile } = parseRiskProfile(
    new URL(request.url).searchParams,
  );

  try {
    const client = createAlpacaPaperClient();
    const [currentTradesToday, journalRiskUsage] = await Promise.all([
      getTodaysMlegOrderCount(client),
      Promise.resolve(getJournalRiskUsage(symbol)),
    ]);
    const effectiveRiskProfile = {
      ...riskProfile,
      ...journalRiskUsage,
      currentTradesToday: Math.max(
        currentTradesToday,
        journalRiskUsage.currentTradesToday,
      ),
    };
    const expirationDateGte = getIsoDateOffset(riskProfile.minDte);
    const expirationDateLte = getIsoDateOffset(riskProfile.maxDte);
    const [contractsResponse, snapshotsResponse] = await Promise.all([
      client.getOptionContracts({
        expirationDateGte,
        expirationDateLte,
        limit: 1000,
        status: "active",
        underlyingSymbols: [symbol],
      }),
      client.getOptionChainSnapshots(symbol, {
        expirationDateGte,
        expirationDateLte,
        limit: 1000,
      }),
    ]);
    const generation = generateVerticalSpreadCandidates({
      contracts: contractsResponse.option_contracts,
      limit,
      riskProfile: effectiveRiskProfile,
      snapshots: snapshotsResponse.snapshots,
    });

    console.info("Generated vertical spread candidates", {
      candidates: generation.candidates.length,
      rejectedCount: generation.rejectedCount,
      scannedSpreads: generation.scannedSpreads,
      symbol,
    });

    return NextResponse.json({
      candidates: generation.candidates,
      fetchedAt: new Date().toISOString(),
      rejectedCount: generation.rejectedCount,
      riskProfile: effectiveRiskProfile,
      scannedSpreads: generation.scannedSpreads,
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
      console.error("Alpaca vertical spread candidate request failed", {
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError(
        "Unable to generate vertical spread candidates from Alpaca data.",
        error.status,
      );
    }

    console.error("Unexpected vertical spread candidate error", error);

    return jsonError("Unable to generate vertical spread candidates.", 500);
  }
}
