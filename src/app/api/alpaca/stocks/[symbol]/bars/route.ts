import { NextResponse } from "next/server";
import {
  DEFAULT_STOCK_BAR_FEED,
  DEFAULT_STOCK_BAR_TIMEFRAME,
  type StockBarsErrorResponse,
  type StockBarsResponse,
  isStockBarFeed,
  isStockBarTimeframe,
} from "@/features/market/types";
import {
  getStockBarsErrorMessage,
  getStockBarsErrorStatus,
  loadStockBars,
  toIsoDateTime,
} from "@/features/market/server";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

function jsonError(
  error: string,
  status: number,
): NextResponse<StockBarsErrorResponse> {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<StockBarsResponse | StockBarsErrorResponse>> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    return jsonError("Invalid stock symbol.", 400);
  }

  const searchParams = new URL(request.url).searchParams;
  const timeframeParam = searchParams.get("timeframe");
  const feedParam = searchParams.get("feed");
  const timeframe = isStockBarTimeframe(timeframeParam)
    ? timeframeParam
    : DEFAULT_STOCK_BAR_TIMEFRAME;
  const feed = isStockBarFeed(feedParam) ? feedParam : DEFAULT_STOCK_BAR_FEED;
  const end = toIsoDateTime(searchParams.get("end")) ?? new Date().toISOString();
  let start: string | undefined;

  if (searchParams.has("start")) {
    const parsedStart = toIsoDateTime(searchParams.get("start"));

    if (!parsedStart) {
      return jsonError("Invalid chart start date.", 400);
    }

    start = parsedStart;
  }

  try {
    const data = await loadStockBars({
      end,
      feed,
      start,
      symbol,
      timeframe,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Unexpected stock bars error", error);

    return jsonError(
      getStockBarsErrorMessage(error),
      getStockBarsErrorStatus(error),
    );
  }
}
