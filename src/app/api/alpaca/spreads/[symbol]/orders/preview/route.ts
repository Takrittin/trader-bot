import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import { recordAuditEvent } from "@/features/journal/database";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import { defaultVerticalSpreadRiskProfile } from "@/features/risk/types";
import {
  createPaperMlegOrderPreview,
  PaperOrderPreviewError,
} from "@/features/orders/paper-mleg";
import type {
  PaperMlegOrderErrorResponse,
  PaperMlegOrderPreviewRequest,
  PaperMlegOrderPreviewResponse,
} from "@/features/orders/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

function isEnvValidationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Invalid server environment:")
  );
}

function jsonError(
  error: string,
  status: number,
): NextResponse<PaperMlegOrderErrorResponse> {
  return NextResponse.json({ error }, { status });
}

function parsePreviewRequest(body: unknown): PaperMlegOrderPreviewRequest {
  const value = body as Partial<PaperMlegOrderPreviewRequest> | null;

  if (!value || typeof value.candidateId !== "string") {
    throw new PaperOrderPreviewError("Missing selected candidate.");
  }

  if (!value.riskProfile || typeof value.riskProfile !== "object") {
    throw new PaperOrderPreviewError("Missing risk profile.");
  }

  return {
    candidateId: value.candidateId,
    limit: typeof value.limit === "number" ? value.limit : 100,
    quantity: typeof value.quantity === "number" ? value.quantity : 1,
    riskProfile: {
      maxBidAskWidth: Number(
        value.riskProfile.maxBidAskWidth ??
          defaultVerticalSpreadRiskProfile.maxBidAskWidth,
      ),
      maxDailyRisk: Number(
        value.riskProfile.maxDailyRisk ??
          defaultVerticalSpreadRiskProfile.maxDailyRisk,
      ),
      maxDte: Number(
        value.riskProfile.maxDte ?? defaultVerticalSpreadRiskProfile.maxDte,
      ),
      maxLoss: Number(
        value.riskProfile.maxLoss ?? defaultVerticalSpreadRiskProfile.maxLoss,
      ),
      maxOpenTrades: Number(
        value.riskProfile.maxOpenTrades ??
          defaultVerticalSpreadRiskProfile.maxOpenTrades,
      ),
      maxTradesPerDay: Number(
        value.riskProfile.maxTradesPerDay ??
          defaultVerticalSpreadRiskProfile.maxTradesPerDay,
      ),
      maxTradesPerSymbol: Number(
        value.riskProfile.maxTradesPerSymbol ??
          defaultVerticalSpreadRiskProfile.maxTradesPerSymbol,
      ),
      minDte: Number(
        value.riskProfile.minDte ?? defaultVerticalSpreadRiskProfile.minDte,
      ),
      minOpenInterest: Number(
        value.riskProfile.minOpenInterest ??
          defaultVerticalSpreadRiskProfile.minOpenInterest,
      ),
    },
  };
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<PaperMlegOrderPreviewResponse | PaperMlegOrderErrorResponse>> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    return jsonError("Invalid underlying symbol.", 400);
  }

  try {
    const body = await request.json();
    const previewRequest = parsePreviewRequest(body);
    const client = createAlpacaPaperClient();
    const preview = await createPaperMlegOrderPreview({
      client,
      request: previewRequest,
      symbol,
    });

    recordAuditEvent({
      details: {
        candidateId: preview.candidate.id,
        estimatedMaxLoss: preview.estimatedMaxLoss,
        estimatedMaxProfit: preview.estimatedMaxProfit,
        quantity: preview.quantity,
        score: preview.candidate.score,
        underlyingSymbol: symbol,
      },
      eventType: "paper_order_previewed",
    });

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      preview,
      underlyingSymbol: symbol,
    });
  } catch (error) {
    if (error instanceof PaperOrderPreviewError) {
      return jsonError(error.message, error.status);
    }

    if (isEnvValidationError(error)) {
      return jsonError(
        "Alpaca paper credentials are not configured correctly. Check .env.local.",
        500,
      );
    }

    if (error instanceof AlpacaClientError) {
      console.error("Alpaca paper order preview failed", {
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError("Unable to preview the paper mleg order.", error.status);
    }

    console.error("Unexpected paper order preview error", error);

    return jsonError("Unable to preview the paper mleg order.", 500);
  }
}
