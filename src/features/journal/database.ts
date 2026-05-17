import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PaperMlegOrderPreview } from "@/features/orders/types";
import type {
  JournalAuditEvent,
  JournalOrderListResponse,
  JournalOrderRecord,
  JournalOrderStatus,
  JournalRiskUsage,
} from "@/features/journal/types";
import type { AlpacaOrder } from "@/lib/alpaca/types";

const terminalStatuses = new Set([
  "canceled",
  "expired",
  "filled",
  "rejected",
]);

type OrderRow = {
  alpaca_order_id: string;
  candidate_id: string;
  candidate_json: string;
  client_order_id: string | null;
  created_at: string;
  dte: number;
  estimated_max_loss: number;
  estimated_max_profit: number;
  expiration_date: string;
  id: string;
  limit_price: number;
  net_credit: number | null;
  net_debit: number | null;
  order_request_json: string;
  order_response_json: string;
  quantity: number;
  reward_risk_ratio: number;
  risk_checks_json: string;
  score: number;
  score_grade: JournalOrderRecord["scoreGrade"];
  scoring_json: string;
  status: JournalOrderStatus;
  strategy: JournalOrderRecord["strategy"];
  underlying_symbol: string;
  updated_at: string;
};

type AuditRow = {
  created_at: string;
  details_json: string;
  event_type: string;
  id: string;
};

let database: DatabaseSync | null = null;

function getJournalPath(): string {
  const configuredPath =
    process.env.BOTTRADER_JOURNAL_DB_PATH || ".data/bottrader.sqlite";

  return resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

function getDatabase(): DatabaseSync {
  if (database) {
    return database;
  }

  const databasePath = getJournalPath();

  mkdirSync(dirname(databasePath), { recursive: true });

  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS paper_order_journal (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      underlying_symbol TEXT NOT NULL,
      alpaca_order_id TEXT NOT NULL UNIQUE,
      client_order_id TEXT,
      status TEXT NOT NULL,
      strategy TEXT NOT NULL,
      expiration_date TEXT NOT NULL,
      dte INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      limit_price REAL NOT NULL,
      net_debit REAL,
      net_credit REAL,
      estimated_max_loss REAL NOT NULL,
      estimated_max_profit REAL NOT NULL,
      score REAL NOT NULL,
      score_grade TEXT NOT NULL,
      reward_risk_ratio REAL NOT NULL,
      candidate_id TEXT NOT NULL,
      candidate_json TEXT NOT NULL,
      order_request_json TEXT NOT NULL,
      order_response_json TEXT NOT NULL,
      risk_checks_json TEXT NOT NULL,
      scoring_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS paper_order_journal_created_idx
      ON paper_order_journal(created_at DESC);
    CREATE INDEX IF NOT EXISTS paper_order_journal_symbol_idx
      ON paper_order_journal(underlying_symbol, created_at DESC);
    CREATE INDEX IF NOT EXISTS paper_order_journal_status_idx
      ON paper_order_journal(status);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS audit_events_created_idx
      ON audit_events(created_at DESC);
  `);

  return database;
}

function createJournalId(prefix: string): string {
  const randomValue = Math.random().toString(36).slice(2, 10);

  return `${prefix}_${Date.now()}_${randomValue}`;
}

function parseJson<TValue>(value: string): TValue {
  return JSON.parse(value) as TValue;
}

function toOrderRecord(row: OrderRow): JournalOrderRecord {
  return {
    alpacaOrderId: row.alpaca_order_id,
    candidate: parseJson(row.candidate_json),
    candidateId: row.candidate_id,
    clientOrderId: row.client_order_id,
    createdAt: row.created_at,
    dte: row.dte,
    estimatedMaxLoss: row.estimated_max_loss,
    estimatedMaxProfit: row.estimated_max_profit,
    expirationDate: row.expiration_date,
    id: row.id,
    limitPrice: row.limit_price,
    netCredit: row.net_credit,
    netDebit: row.net_debit,
    orderRequest: parseJson(row.order_request_json),
    orderResponse: parseJson(row.order_response_json),
    quantity: row.quantity,
    rewardRiskRatio: row.reward_risk_ratio,
    riskChecks: parseJson(row.risk_checks_json),
    score: row.score,
    scoreGrade: row.score_grade,
    scoring: parseJson(row.scoring_json),
    status: row.status,
    strategy: row.strategy,
    underlyingSymbol: row.underlying_symbol,
    updatedAt: row.updated_at,
  };
}

function toAuditEvent(row: AuditRow): JournalAuditEvent {
  return {
    createdAt: row.created_at,
    details: parseJson(row.details_json),
    eventType: row.event_type,
    id: row.id,
  };
}

function getTodayStartIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function isOpenStatus(status: string): boolean {
  return !terminalStatuses.has(status);
}

export function recordAuditEvent({
  details,
  eventType,
}: {
  details: Record<string, unknown>;
  eventType: string;
}): JournalAuditEvent {
  const event: JournalAuditEvent = {
    createdAt: new Date().toISOString(),
    details,
    eventType,
    id: createJournalId("audit"),
  };

  getDatabase()
    .prepare(
      `INSERT INTO audit_events (id, created_at, event_type, details_json)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      event.id,
      event.createdAt,
      event.eventType,
      JSON.stringify(event.details),
    );

  return event;
}

export function recordPaperOrderSubmission({
  order,
  preview,
  underlyingSymbol,
}: {
  order: AlpacaOrder;
  preview: PaperMlegOrderPreview;
  underlyingSymbol: string;
}): JournalOrderRecord {
  const now = new Date().toISOString();
  const record: JournalOrderRecord = {
    alpacaOrderId: order.id,
    candidate: preview.candidate,
    candidateId: preview.candidate.id,
    clientOrderId: order.client_order_id ?? preview.order.client_order_id ?? null,
    createdAt: now,
    dte: preview.candidate.dte,
    estimatedMaxLoss: preview.estimatedMaxLoss,
    estimatedMaxProfit: preview.estimatedMaxProfit,
    expirationDate: preview.candidate.expirationDate,
    id: createJournalId("order"),
    limitPrice: Number(preview.order.limit_price),
    netCredit: preview.candidate.netCredit,
    netDebit: preview.candidate.netDebit,
    orderRequest: preview.order,
    orderResponse: order,
    quantity: preview.quantity,
    rewardRiskRatio: preview.candidate.rewardRiskRatio,
    riskChecks: preview.riskChecks,
    score: preview.candidate.score,
    scoreGrade: preview.candidate.scoreGrade,
    scoring: preview.candidate.scoring,
    status: order.status,
    strategy: preview.candidate.strategy,
    underlyingSymbol,
    updatedAt: now,
  };

  getDatabase()
    .prepare(
      `INSERT INTO paper_order_journal (
        id,
        created_at,
        updated_at,
        underlying_symbol,
        alpaca_order_id,
        client_order_id,
        status,
        strategy,
        expiration_date,
        dte,
        quantity,
        limit_price,
        net_debit,
        net_credit,
        estimated_max_loss,
        estimated_max_profit,
        score,
        score_grade,
        reward_risk_ratio,
        candidate_id,
        candidate_json,
        order_request_json,
        order_response_json,
        risk_checks_json,
        scoring_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      record.createdAt,
      record.updatedAt,
      record.underlyingSymbol,
      record.alpacaOrderId,
      record.clientOrderId,
      record.status,
      record.strategy,
      record.expirationDate,
      record.dte,
      record.quantity,
      record.limitPrice,
      record.netDebit,
      record.netCredit,
      record.estimatedMaxLoss,
      record.estimatedMaxProfit,
      record.score,
      record.scoreGrade,
      record.rewardRiskRatio,
      record.candidateId,
      JSON.stringify(record.candidate),
      JSON.stringify(record.orderRequest),
      JSON.stringify(record.orderResponse),
      JSON.stringify(record.riskChecks),
      JSON.stringify(record.scoring),
    );

  recordAuditEvent({
    details: {
      alpacaOrderId: record.alpacaOrderId,
      candidateId: record.candidateId,
      estimatedMaxLoss: record.estimatedMaxLoss,
      score: record.score,
      status: record.status,
      underlyingSymbol,
    },
    eventType: "paper_order_submitted",
  });

  return record;
}

export function updateJournalOrderFromAlpaca(order: AlpacaOrder): void {
  getDatabase()
    .prepare(
      `UPDATE paper_order_journal
       SET status = ?, updated_at = ?, order_response_json = ?
       WHERE alpaca_order_id = ?`,
    )
    .run(
      order.status,
      new Date().toISOString(),
      JSON.stringify(order),
      order.id,
    );
}

export function listJournalOrders(limit = 50): JournalOrderRecord[] {
  const rows = getDatabase()
    .prepare(
      `SELECT *
       FROM paper_order_journal
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as OrderRow[];

  return rows.map(toOrderRecord);
}

export function listAuditEvents(limit = 50): JournalAuditEvent[] {
  const rows = getDatabase()
    .prepare(
      `SELECT *
       FROM audit_events
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as AuditRow[];

  return rows.map(toAuditEvent);
}

export function getJournalRiskUsage(symbol: string): JournalRiskUsage {
  const orders = listJournalOrders(500);
  const todayStartIso = getTodayStartIso();
  const todayOrders = orders.filter((order) => order.createdAt >= todayStartIso);
  const openOrders = orders.filter((order) => isOpenStatus(order.status));

  return {
    currentDailyRisk: todayOrders
      .filter((order) => order.status !== "rejected" && order.status !== "canceled")
      .reduce((total, order) => total + order.estimatedMaxLoss, 0),
    currentOpenTrades: openOrders.length,
    currentSymbolTradesToday: todayOrders.filter(
      (order) => order.underlyingSymbol === symbol,
    ).length,
    currentTradesToday: todayOrders.length,
  };
}

export function hasOpenCandidate(candidateId: string): boolean {
  return listJournalOrders(500).some(
    (order) => order.candidateId === candidateId && isOpenStatus(order.status),
  );
}

export function summarizeJournalOrders(
  orders: JournalOrderRecord[],
  syncedFromAlpaca: boolean,
): JournalOrderListResponse {
  const openOrders = orders.filter((order) => isOpenStatus(order.status));
  const scoreTotal = orders.reduce((total, order) => total + order.score, 0);

  return {
    fetchedAt: new Date().toISOString(),
    orders,
    summary: {
      averageScore: orders.length > 0 ? Math.round(scoreTotal / orders.length) : 0,
      openRisk: openOrders.reduce(
        (total, order) => total + order.estimatedMaxLoss,
        0,
      ),
      openTrades: openOrders.length,
      totalOrders: orders.length,
      totalRiskLogged: orders.reduce(
        (total, order) => total + order.estimatedMaxLoss,
        0,
      ),
    },
    syncedFromAlpaca,
  };
}
