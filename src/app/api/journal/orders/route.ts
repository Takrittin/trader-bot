import { NextResponse } from "next/server";
import { AlpacaClientError, createAlpacaPaperClient } from "@/lib/alpaca/client";
import {
  listJournalOrders,
  summarizeJournalOrders,
  updateJournalOrderFromAlpaca,
} from "@/features/journal/database";
import type {
  JournalErrorResponse,
  JournalOrderListResponse,
} from "@/features/journal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(
  error: string,
  status: number,
): NextResponse<JournalErrorResponse> {
  return NextResponse.json({ error }, { status });
}

function shouldSyncOrders(request: Request): boolean {
  return new URL(request.url).searchParams.get("sync") === "1";
}

export async function GET(
  request: Request,
): Promise<NextResponse<JournalOrderListResponse | JournalErrorResponse>> {
  try {
    let syncedFromAlpaca = false;
    let orders = listJournalOrders();

    if (shouldSyncOrders(request) && orders.length > 0) {
      const client = createAlpacaPaperClient();

      await Promise.all(
        orders
          .filter((order) => order.alpacaOrderId)
          .map(async (order) => {
            const alpacaOrder = await client.getOrder(order.alpacaOrderId);

            updateJournalOrderFromAlpaca(alpacaOrder);
          }),
      );

      syncedFromAlpaca = true;
      orders = listJournalOrders();
    }

    return NextResponse.json(summarizeJournalOrders(orders, syncedFromAlpaca));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid server environment:")
    ) {
      return jsonError(
        "Journal is available, but Alpaca credentials are not configured for status sync.",
        500,
      );
    }

    if (error instanceof AlpacaClientError) {
      console.error("Unable to sync Alpaca order status", {
        status: error.status,
        statusText: error.statusText,
      });

      return jsonError("Unable to sync Alpaca order status.", error.status);
    }

    console.error("Unable to load journal orders", error);

    return jsonError("Unable to load journal orders.", 500);
  }
}
