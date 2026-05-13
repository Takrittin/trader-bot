import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
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
      maxBidAskWidth: Number(value.riskProfile.maxBidAskWidth),
      maxDte: Number(value.riskProfile.maxDte),
      maxLoss: Number(value.riskProfile.maxLoss),
      maxTradesPerDay: Number(value.riskProfile.maxTradesPerDay),
      minDte: Number(value.riskProfile.minDte),
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
