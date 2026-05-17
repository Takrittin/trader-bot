import "server-only";

import type { AlpacaPaperClient } from "@/lib/alpaca/client";
import type { AlpacaMlegLimitOrderRequest, AlpacaOrder } from "@/lib/alpaca/types";
import { areSubmissionsDisabled } from "@/features/kill-switch/state";
import { getJournalRiskUsage, hasOpenCandidate } from "@/features/journal/database";
import { getIsoDateOffset } from "@/features/options/date";
import { evaluateVerticalSpreadRisk } from "@/features/risk/vertical-spread-risk";
import type {
  ConfigurableVerticalSpreadRiskProfile,
  VerticalSpreadRiskProfile,
} from "@/features/risk/types";
import { generateVerticalSpreadCandidates } from "@/features/spreads/generator";
import type { VerticalSpreadCandidate } from "@/features/spreads/types";
import type {
  PaperMlegOrderPreview,
  PaperMlegOrderPreviewRequest,
} from "@/features/orders/types";

export class PaperOrderPreviewError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PaperOrderPreviewError";
  }
}

function getUtcDayRange(now = new Date()): { after: string; until: string } {
  const after = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const until = new Date(after);

  until.setUTCDate(until.getUTCDate() + 1);

  return {
    after: after.toISOString(),
    until: until.toISOString(),
  };
}

function toQuantity(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new PaperOrderPreviewError("Quantity must be a whole number from 1 to 10.");
  }

  return value;
}

function formatLimitPrice(value: number): string {
  const decimals = Math.abs(value) < 1 ? 4 : 2;

  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

function createClientOrderId(): string {
  const randomValue = Math.random().toString(36).slice(2, 10);

  return `bottrader-${Date.now()}-${randomValue}`;
}

export async function getTodaysMlegOrderCount(
  client: AlpacaPaperClient,
): Promise<number> {
  const { after, until } = getUtcDayRange();
  const orders = await client.getOrders({
    after,
    direction: "desc",
    limit: 500,
    nested: true,
    status: "all",
    until,
  });

  return orders.filter((order: AlpacaOrder) => order.order_class === "mleg")
    .length;
}

function getLimitPrice(candidate: VerticalSpreadCandidate): number {
  if (candidate.netDebit !== null) {
    return candidate.netDebit;
  }

  if (candidate.netCredit !== null) {
    return -candidate.netCredit;
  }

  throw new PaperOrderPreviewError("Candidate is missing a limit price.");
}

function buildMlegLimitOrder(
  candidate: VerticalSpreadCandidate,
  quantity: number,
  includeClientOrderId: boolean,
): AlpacaMlegLimitOrderRequest {
  return {
    ...(includeClientOrderId ? { client_order_id: createClientOrderId() } : {}),
    extended_hours: false,
    legs: candidate.legs.map((leg) => ({
      position_intent: leg.action === "buy" ? "buy_to_open" : "sell_to_open",
      ratio_qty: "1",
      side: leg.action,
      symbol: leg.symbol,
    })),
    limit_price: formatLimitPrice(getLimitPrice(candidate)),
    order_class: "mleg",
    qty: String(quantity),
    time_in_force: "day",
    type: "limit",
  };
}

function validateRiskProfile(
  riskProfile: ConfigurableVerticalSpreadRiskProfile,
): ConfigurableVerticalSpreadRiskProfile {
  if (riskProfile.minDte < 1 || riskProfile.maxDte < riskProfile.minDte) {
    throw new PaperOrderPreviewError("Expiration range is invalid.");
  }

  if (riskProfile.maxLoss <= 0) {
    throw new PaperOrderPreviewError("Max loss must be greater than zero.");
  }

  if (riskProfile.maxBidAskWidth <= 0) {
    throw new PaperOrderPreviewError("Max bid/ask width must be greater than zero.");
  }

  if (riskProfile.maxTradesPerDay < 1) {
    throw new PaperOrderPreviewError("Max trades per day must be at least one.");
  }

  if (riskProfile.maxDailyRisk <= 0) {
    throw new PaperOrderPreviewError("Max daily risk must be greater than zero.");
  }

  if (riskProfile.maxOpenTrades < 1) {
    throw new PaperOrderPreviewError("Max open trades must be at least one.");
  }

  if (riskProfile.maxTradesPerSymbol < 1) {
    throw new PaperOrderPreviewError("Max trades per symbol must be at least one.");
  }

  if (riskProfile.minOpenInterest < 0) {
    throw new PaperOrderPreviewError("Minimum open interest cannot be negative.");
  }

  return riskProfile;
}

export async function createPaperMlegOrderPreview({
  client,
  includeClientOrderId = false,
  request,
  symbol,
}: {
  client: AlpacaPaperClient;
  includeClientOrderId?: boolean;
  request: PaperMlegOrderPreviewRequest;
  symbol: string;
}): Promise<PaperMlegOrderPreview> {
  const quantity = toQuantity(request.quantity);
  const requestedRiskProfile = validateRiskProfile(request.riskProfile);
  const [currentTradesToday, journalRiskUsage] = await Promise.all([
    getTodaysMlegOrderCount(client),
    Promise.resolve(getJournalRiskUsage(symbol)),
  ]);
  const riskProfile: VerticalSpreadRiskProfile = {
    ...requestedRiskProfile,
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
    limit: Math.max(request.limit ?? 100, 100),
    riskProfile,
    snapshots: snapshotsResponse.snapshots,
  });
  const candidate = generation.candidates.find(
    (item) => item.id === request.candidateId,
  );

  if (!candidate) {
    throw new PaperOrderPreviewError(
      "Selected candidate no longer passes the active risk checks.",
      409,
    );
  }

  if (hasOpenCandidate(candidate.id)) {
    throw new PaperOrderPreviewError(
      "An open paper order already exists for this spread candidate.",
      409,
    );
  }

  const estimatedMaxLoss = Math.round(candidate.maxLoss * quantity * 100) / 100;
  const estimatedMaxProfit =
    Math.round(candidate.maxProfit * quantity * 100) / 100;
  const riskChecks = evaluateVerticalSpreadRisk(
    {
      dte: candidate.dte,
      maxBidAskWidth: candidate.maxBidAskWidth,
      maxLoss: estimatedMaxLoss,
      minOpenInterest: candidate.minOpenInterest,
    },
    riskProfile,
  );

  if (!riskChecks.every((check) => check.passed)) {
    throw new PaperOrderPreviewError(
      "Selected order does not pass the active risk checks.",
      409,
    );
  }

  return {
    candidate,
    estimatedMaxLoss,
    estimatedMaxProfit,
    order: buildMlegLimitOrder(candidate, quantity, includeClientOrderId),
    quantity,
    riskChecks,
    riskProfile,
    submissionsDisabled: areSubmissionsDisabled(),
  };
}
