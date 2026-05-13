import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import { areSubmissionsDisabled } from "@/features/kill-switch/state";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import {
  createPaperMlegOrderPreview,
  PaperOrderPreviewError,
} from "@/features/orders/paper-mleg";
import {
  PAPER_ORDER_CONFIRMATION_PHRASE,
  type PaperMlegOrderErrorResponse,
  type PaperMlegOrderSubmitRequest,
  type PaperMlegOrderSubmitResponse,
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

function parseSubmitRequest(body: unknown): PaperMlegOrderSubmitRequest {
  const value = body as Partial<PaperMlegOrderSubmitRequest> | null;

  if (!value || typeof value.candidateId !== "string") {
    throw new PaperOrderPreviewError("Missing selected candidate.");
  }

  if (value.confirmation !== PAPER_ORDER_CONFIRMATION_PHRASE) {
    throw new PaperOrderPreviewError("Explicit paper order confirmation is required.");
  }

  if (!value.riskProfile || typeof value.riskProfile !== "object") {
    throw new PaperOrderPreviewError("Missing risk profile.");
  }

  return {
    candidateId: value.candidateId,
    confirmation: value.confirmation,
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
): Promise<NextResponse<PaperMlegOrderSubmitResponse | PaperMlegOrderErrorResponse>> {
  const { symbol: rawSymbol } = await context.params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    return jsonError("Invalid underlying symbol.", 400);
  }

  if (areSubmissionsDisabled()) {
    return jsonError("Order submissions are disabled by the kill switch.", 423);
  }

  try {
    const body = await request.json();
    const submitRequest = parseSubmitRequest(body);
    const client = createAlpacaPaperClient();
    const preview = await createPaperMlegOrderPreview({
      client,
      includeClientOrderId: true,
      request: submitRequest,
      symbol,
    });

    if (areSubmissionsDisabled()) {
      return jsonError("Order submissions are disabled by the kill switch.", 423);
    }

    const order = await client.submitMlegLimitOrder(preview.order);

    console.info("Submitted paper mleg limit order", {
      orderId: order.id,
      status: order.status,
      symbol,
    });

    return NextResponse.json({
      order,
      preview,
      submittedAt: new Date().toISOString(),
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
      console.error("Alpaca paper order submission failed", {
        responseBody: error.responseBody,
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError("Unable to submit the paper mleg order.", error.status);
    }

    console.error("Unexpected paper order submission error", error);

    return jsonError("Unable to submit the paper mleg order.", 500);
  }
}
