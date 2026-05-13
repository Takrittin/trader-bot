import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import type { AlpacaOptionSnapshot } from "@/lib/alpaca/types";
import { getTomorrowIsoDate } from "@/features/options/date";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import type {
  OptionChainErrorResponse,
  OptionSnapshotsResponse,
} from "@/features/options/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

function toFiniteNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toSnapshotSummary(
  symbol: string,
  snapshot: AlpacaOptionSnapshot,
): OptionSnapshotsResponse["snapshots"][string] {
  const quote = snapshot.latestQuote ?? snapshot.latest_quote ?? null;

  return {
    ask: toFiniteNumber(quote?.ap ?? quote?.ask_price),
    bid: toFiniteNumber(quote?.bp ?? quote?.bid_price),
    delta: toFiniteNumber(snapshot.greeks?.delta),
    symbol,
    theta: toFiniteNumber(snapshot.greeks?.theta),
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
  request: Request,
  context: RouteContext,
): Promise<NextResponse<OptionSnapshotsResponse | OptionChainErrorResponse>> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    return jsonError("Invalid underlying symbol.", 400);
  }

  const feed = new URL(request.url).searchParams.get("feed");

  try {
    const client = createAlpacaPaperClient();
    const response = await client.getOptionChainSnapshots(symbol, {
      expirationDateGte: getTomorrowIsoDate(),
      feed: feed === "opra" || feed === "indicative" ? feed : undefined,
      limit: 1000,
    });
    const snapshots = Object.fromEntries(
      Object.entries(response.snapshots).map(([contractSymbol, snapshot]) => [
        contractSymbol,
        toSnapshotSummary(contractSymbol, snapshot),
      ]),
    );

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      nextPageToken: response.next_page_token ?? null,
      snapshots,
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
      console.error("Alpaca option snapshots request failed", {
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError(
        "Unable to fetch Alpaca option snapshots from the data API.",
        error.status,
      );
    }

    console.error("Unexpected option snapshots error", error);

    return jsonError("Unable to load option snapshots.", 500);
  }
}
