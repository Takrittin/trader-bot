"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  JournalAuditListResponse,
  JournalErrorResponse,
  JournalOrderListResponse,
  JournalOrderRecord,
} from "@/features/journal/types";
import type { VerticalSpreadStrategy } from "@/features/spreads/types";

type ResourceState<TData> =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { data: TData; status: "success" };

const strategyLabels: Record<VerticalSpreadStrategy, string> = {
  bear_call_credit: "Bear call credit",
  bear_put_debit: "Bear put debit",
  bull_call_debit: "Bull call debit",
  bull_put_credit: "Bull put credit",
};

async function parseJsonResponse<TData extends object>(
  response: Response,
  fallbackError: string,
): Promise<TData> {
  const body = (await response.json().catch(() => ({}))) as
    | TData
    | JournalErrorResponse;

  if (!response.ok) {
    throw new Error("error" in body ? body.error : fallbackError);
  }

  return body as TData;
}

function formatMoney(value: number | string | null): string {
  if (value === null) {
    return "Not available";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatWholeNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getPremiumLabel(order: JournalOrderRecord): string {
  if (order.netDebit !== null) {
    return `Debit ${formatMoney(order.netDebit)}`;
  }

  return `Credit ${formatMoney(order.netCredit)}`;
}

async function fetchJournalOrders(
  syncFromAlpaca = false,
): Promise<JournalOrderListResponse> {
  const response = await fetch(
    `/api/journal/orders${syncFromAlpaca ? "?sync=1" : ""}`,
    {
      cache: "no-store",
    },
  );

  return parseJsonResponse<JournalOrderListResponse>(
    response,
    "Unable to load paper order journal.",
  );
}

async function fetchAuditEvents(): Promise<JournalAuditListResponse> {
  const response = await fetch("/api/journal/audit", {
    cache: "no-store",
  });

  return parseJsonResponse<JournalAuditListResponse>(
    response,
    "Unable to load audit events.",
  );
}

export function JournalDashboard() {
  const [ordersState, setOrdersState] = useState<
    ResourceState<JournalOrderListResponse>
  >({ status: "loading" });
  const [auditState, setAuditState] = useState<
    ResourceState<JournalAuditListResponse>
  >({ status: "loading" });
  const [syncing, setSyncing] = useState(false);

  const loadOrders = useCallback(async (syncFromAlpaca = false) => {
    if (syncFromAlpaca) {
      setSyncing(true);
    }

    try {
      const data = await fetchJournalOrders(syncFromAlpaca);

      setOrdersState({ data, status: "success" });
    } catch (error) {
      setOrdersState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to load paper order journal.",
        status: "error",
      });
    } finally {
      setSyncing(false);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const data = await fetchAuditEvents();

      setAuditState({ data, status: "success" });
    } catch (error) {
      setAuditState({
        message:
          error instanceof Error ? error.message : "Unable to load audit events.",
        status: "error",
      });
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialJournal() {
      const [ordersResult, auditResult] = await Promise.allSettled([
        fetchJournalOrders(),
        fetchAuditEvents(),
      ]);

      if (!active) {
        return;
      }

      if (ordersResult.status === "fulfilled") {
        setOrdersState({ data: ordersResult.value, status: "success" });
      } else {
        setOrdersState({
          message:
            ordersResult.reason instanceof Error
              ? ordersResult.reason.message
              : "Unable to load paper order journal.",
          status: "error",
        });
      }

      if (auditResult.status === "fulfilled") {
        setAuditState({ data: auditResult.value, status: "success" });
      } else {
        setAuditState({
          message:
            auditResult.reason instanceof Error
              ? auditResult.reason.message
              : "Unable to load audit events.",
          status: "error",
        });
      }
    }

    void loadInitialJournal();

    return () => {
      active = false;
    };
  }, []);

  const statusCounts = useMemo(() => {
    if (ordersState.status !== "success") {
      return [];
    }

    const counts = new Map<string, number>();

    for (const order of ordersState.data.orders) {
      counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    }

    return Array.from(counts.entries()).toSorted((left, right) =>
      left[0].localeCompare(right[0]),
    );
  }, [ordersState]);

  const orders = ordersState.status === "success" ? ordersState.data.orders : [];

  return (
    <main className="app-shell workspace-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Paper audit trail</p>
          <h1>Journal</h1>
          <p className="lede">
            Local SQLite history for previews, submissions, status syncs, and
            kill-switch changes.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="button secondary"
            type="button"
            disabled={syncing}
            onClick={() => void loadOrders(true)}
          >
            {syncing ? "Syncing..." : "Sync statuses"}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              void loadOrders();
              void loadAudit();
            }}
          >
            Refresh
          </button>
        </div>
      </section>

      {ordersState.status === "error" ? (
        <section className="account-card error-card" role="alert">
          <p className="panel-label">Journal unavailable</p>
          <h2>Could not load orders</h2>
          <p>{ordersState.message}</p>
        </section>
      ) : null}

      <section className="metric-grid dashboard-metrics" aria-label="Journal summary">
        <article className="metric-card">
          <p>Total orders</p>
          <strong>
            {ordersState.status === "success"
              ? formatWholeNumber(ordersState.data.summary.totalOrders)
              : "Loading"}
          </strong>
        </article>
        <article className="metric-card">
          <p>Open risk</p>
          <strong>
            {ordersState.status === "success"
              ? formatMoney(ordersState.data.summary.openRisk)
              : "Loading"}
          </strong>
        </article>
        <article className="metric-card">
          <p>Average score</p>
          <strong>
            {ordersState.status === "success"
              ? ordersState.data.summary.averageScore
              : "Loading"}
          </strong>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-main">
          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Paper orders</p>
                <h2>Order history</h2>
              </div>
              {ordersState.status === "success" ? (
                <span className="option-type call">
                  {ordersState.data.syncedFromAlpaca ? "synced" : "local"}
                </span>
              ) : null}
            </div>

            {ordersState.status === "loading" ? (
              <div className="loading-grid chain-loading" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : null}

            {ordersState.status === "success" && orders.length === 0 ? (
              <div className="empty-state">
                <strong>No submitted paper orders yet</strong>
                <p>
                  Submit a paper mleg order from the spread page to create the
                  first journal entry.
                </p>
              </div>
            ) : null}

            {ordersState.status === "success" && orders.length > 0 ? (
              <div className="journal-table" role="table">
                <div className="journal-row journal-head" role="row">
                  <span>Created</span>
                  <span>Strategy</span>
                  <span>Status</span>
                  <span>Score</span>
                  <span>Risk</span>
                </div>
                {orders.map((order) => (
                  <div className="journal-row" key={order.id} role="row">
                    <span>
                      {formatDateTime(order.createdAt)}
                      <small>{order.alpacaOrderId}</small>
                    </span>
                    <span>
                      <strong>{strategyLabels[order.strategy]}</strong>
                      <small>
                        {order.underlyingSymbol} · {getPremiumLabel(order)}
                      </small>
                    </span>
                    <span>{order.status}</span>
                    <span>
                      {order.scoreGrade} · {order.score}
                      <small>{order.rewardRiskRatio.toFixed(2)}:1 R/R</small>
                    </span>
                    <span>
                      {formatMoney(order.estimatedMaxLoss)}
                      <small>
                        Max profit {formatMoney(order.estimatedMaxProfit)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="dashboard-rail">
          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Paper replay</p>
                <h2>Status mix</h2>
              </div>
            </div>
            {statusCounts.length > 0 ? (
              <div className="activity-list">
                {statusCounts.map(([status, count]) => (
                  <div key={status}>
                    <span>{status}</span>
                    <strong>{formatWholeNumber(count)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No replay data</strong>
                <p>The replay summary will populate from journaled orders.</p>
              </div>
            )}
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Audit events</p>
                <h2>Recent events</h2>
              </div>
            </div>
            {auditState.status === "loading" ? (
              <div className="loading-grid" aria-hidden="true">
                <span />
                <span />
              </div>
            ) : null}
            {auditState.status === "error" ? (
              <div className="empty-state" role="alert">
                <strong>Audit unavailable</strong>
                <p>{auditState.message}</p>
              </div>
            ) : null}
            {auditState.status === "success" && auditState.data.events.length === 0 ? (
              <div className="empty-state">
                <strong>No audit events yet</strong>
                <p>Preview, submit, or toggle the kill switch to create events.</p>
              </div>
            ) : null}
            {auditState.status === "success" && auditState.data.events.length > 0 ? (
              <div className="activity-list">
                {auditState.data.events.slice(0, 8).map((event) => (
                  <div key={event.id}>
                    <span>{event.eventType.replaceAll("_", " ")}</span>
                    <strong>{formatDateTime(event.createdAt)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}
