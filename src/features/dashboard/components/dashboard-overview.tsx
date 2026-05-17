"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  AccountDashboardErrorResponse,
  AccountDashboardResponse,
} from "@/features/account/types";
import type { KillSwitchStatus } from "@/features/kill-switch/types";
import type {
  JournalErrorResponse,
  JournalOrderListResponse,
} from "@/features/journal/types";
import { defaultVerticalSpreadRiskProfile } from "@/features/risk/types";
import type {
  VerticalSpreadCandidate,
  VerticalSpreadCandidatesErrorResponse,
  VerticalSpreadCandidatesResponse,
  VerticalSpreadStrategy,
} from "@/features/spreads/types";

type ResourceState<TData> =
  | { status: "loading" }
  | { message: string; status: "error" }
  | { data: TData; status: "success" };

const watchSymbol = "SPY";

const strategyLabels: Record<VerticalSpreadStrategy, string> = {
  bear_call_credit: "Bear call credit",
  bear_put_debit: "Bear put debit",
  bull_call_debit: "Bull call debit",
  bull_put_credit: "Bull put credit",
};

function buildCandidatesEndpoint(): string {
  const params = new URLSearchParams({
    limit: "6",
    maxBidAskWidth: String(defaultVerticalSpreadRiskProfile.maxBidAskWidth),
    maxDailyRisk: String(defaultVerticalSpreadRiskProfile.maxDailyRisk),
    maxDte: String(defaultVerticalSpreadRiskProfile.maxDte),
    maxLoss: String(defaultVerticalSpreadRiskProfile.maxLoss),
    maxOpenTrades: String(defaultVerticalSpreadRiskProfile.maxOpenTrades),
    maxTradesPerDay: String(defaultVerticalSpreadRiskProfile.maxTradesPerDay),
    maxTradesPerSymbol: String(defaultVerticalSpreadRiskProfile.maxTradesPerSymbol),
    minOpenInterest: String(defaultVerticalSpreadRiskProfile.minOpenInterest),
    minDte: String(defaultVerticalSpreadRiskProfile.minDte),
  });

  return `/api/alpaca/spreads/${watchSymbol}/candidates?${params}`;
}

async function parseJsonResponse<TData extends object, TError extends object>(
  response: Response,
  fallbackError: string,
): Promise<TData> {
  const body = (await response.json().catch(() => ({}))) as TData | TError;

  if (!response.ok) {
    throw new Error("error" in body ? String(body.error) : fallbackError);
  }

  return body as TData;
}

function formatMoney(value: string | number | null, currency = "USD"): string {
  if (value === null) {
    return "Not available";
  }

  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(amount);
}

function formatWholeNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
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

function getPremiumLabel(candidate: VerticalSpreadCandidate): string {
  if (candidate.netDebit !== null) {
    return `Debit ${formatMoney(candidate.netDebit)}`;
  }

  return `Credit ${formatMoney(candidate.netCredit)}`;
}

export function DashboardOverview() {
  const [accountState, setAccountState] = useState<
    ResourceState<AccountDashboardResponse>
  >({ status: "loading" });
  const [killSwitchState, setKillSwitchState] = useState<
    ResourceState<KillSwitchStatus>
  >({ status: "loading" });
  const [candidatesState, setCandidatesState] = useState<
    ResourceState<VerticalSpreadCandidatesResponse>
  >({ status: "loading" });
  const [journalState, setJournalState] = useState<
    ResourceState<JournalOrderListResponse>
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccount() {
      setAccountState({ status: "loading" });

      try {
        const response = await fetch("/api/alpaca/account", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await parseJsonResponse<
          AccountDashboardResponse,
          AccountDashboardErrorResponse
        >(response, "Unable to load Alpaca account.");

        setAccountState({ data, status: "success" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setAccountState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to load Alpaca account.",
          status: "error",
        });
      }
    }

    async function loadKillSwitch() {
      setKillSwitchState({ status: "loading" });

      try {
        const response = await fetch("/api/kill-switch", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await parseJsonResponse<KillSwitchStatus, { error: string }>(
          response,
          "Unable to load kill switch state.",
        );

        setKillSwitchState({ data, status: "success" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setKillSwitchState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to load kill switch state.",
          status: "error",
        });
      }
    }

    async function loadCandidates() {
      setCandidatesState({ status: "loading" });

      try {
        const response = await fetch(buildCandidatesEndpoint(), {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await parseJsonResponse<
          VerticalSpreadCandidatesResponse,
          VerticalSpreadCandidatesErrorResponse
        >(response, "Unable to generate spread candidates.");

        setCandidatesState({ data, status: "success" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setCandidatesState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to generate spread candidates.",
          status: "error",
        });
      }
    }

    async function loadJournal() {
      setJournalState({ status: "loading" });

      try {
        const response = await fetch("/api/journal/orders", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await parseJsonResponse<
          JournalOrderListResponse,
          JournalErrorResponse
        >(response, "Unable to load paper journal.");

        setJournalState({ data, status: "success" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setJournalState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to load paper journal.",
          status: "error",
        });
      }
    }

    void loadAccount();
    void loadKillSwitch();
    void loadCandidates();
    void loadJournal();

    return () => controller.abort();
  }, []);

  const restrictionCount = useMemo(() => {
    if (accountState.status !== "success") {
      return 0;
    }

    const { account } = accountState.data;

    return [
      account.accountBlocked,
      account.tradingBlocked,
      account.transfersBlocked,
    ].filter(Boolean).length;
  }, [accountState]);

  const riskProfile =
    candidatesState.status === "success"
      ? candidatesState.data.riskProfile
      : defaultVerticalSpreadRiskProfile;
  const topCandidates =
    candidatesState.status === "success"
      ? candidatesState.data.candidates.slice(0, 4)
      : [];
  const latestOrders =
    journalState.status === "success" ? journalState.data.orders.slice(0, 4) : [];

  return (
    <main className="app-shell dashboard-page">
      <section className="dashboard-command" aria-labelledby="dashboard-heading">
        <div>
          <p className="eyebrow">Paper trading cockpit</p>
          <h1 id="dashboard-heading">Dashboard</h1>
          <p className="lede">
            Account health, risk limits, and spread opportunities in one
            workspace.
          </p>
        </div>
        <div className="command-actions" aria-label="Quick actions">
          <Link className="button secondary" href={`/options/${watchSymbol}`}>
            Open chain
          </Link>
          <Link className="button" href={`/spreads/${watchSymbol}`}>
            Generate spreads
          </Link>
          <Link className="button secondary" href="/journal">
            Open journal
          </Link>
        </div>
      </section>

      <section className="status-grid" aria-label="System status">
        <article className="status-card">
          <span className="status-dot" />
          <div>
            <p className="panel-label">Trading mode</p>
            <strong>Paper only</strong>
            <small>No live order surface</small>
          </div>
        </article>
        <article
          className={`status-card ${
            killSwitchState.status === "success" &&
            killSwitchState.data.submissionsDisabled
              ? "is-danger"
              : ""
          }`}
        >
          <span
            className={
              killSwitchState.status === "success" &&
              killSwitchState.data.submissionsDisabled
                ? "status-dot danger"
                : "status-dot"
            }
          />
          <div>
            <p className="panel-label">Kill switch</p>
            <strong>
              {killSwitchState.status === "loading"
                ? "Checking"
                : killSwitchState.status === "error"
                  ? "Unavailable"
                  : killSwitchState.data.submissionsDisabled
                    ? "Active"
                    : "Clear"}
            </strong>
            <small>
              {killSwitchState.status === "error"
                ? killSwitchState.message
                : "Paper submissions"}
            </small>
          </div>
        </article>
        <article
          className={`status-card ${restrictionCount > 0 ? "is-warning" : ""}`}
        >
          <span
            className={restrictionCount > 0 ? "status-dot warning" : "status-dot"}
          />
          <div>
            <p className="panel-label">Account restrictions</p>
            <strong>
              {accountState.status === "loading"
                ? "Checking"
                : accountState.status === "error"
                  ? "Unavailable"
                  : restrictionCount}
            </strong>
            <small>
              {accountState.status === "error"
                ? accountState.message
                : "Trading, transfers, account"}
            </small>
          </div>
        </article>
        <article className="status-card">
          <span className="status-dot info" />
          <div>
            <p className="panel-label">Watch symbol</p>
            <strong>{watchSymbol}</strong>
            <small>
              {candidatesState.status === "success"
                ? `${formatWholeNumber(candidatesState.data.scannedSpreads)} spreads scanned`
                : "Default workspace"}
            </small>
          </div>
        </article>
        <article className="status-card">
          <span className="status-dot info" />
          <div>
            <p className="panel-label">Open risk</p>
            <strong>
              {journalState.status === "success"
                ? formatMoney(journalState.data.summary.openRisk)
                : "Loading"}
            </strong>
            <small>
              {journalState.status === "success"
                ? `${journalState.data.summary.openTrades} open journaled orders`
                : "Local journal"}
            </small>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-main">
          <section className="metric-grid dashboard-metrics" aria-label="Account metrics">
            <article className="metric-card">
              <p>Portfolio value</p>
              <strong>
                {accountState.status === "success"
                  ? formatMoney(
                      accountState.data.account.portfolioValue,
                      accountState.data.account.currency,
                    )
                  : "Not available"}
              </strong>
            </article>
            <article className="metric-card">
              <p>Buying power</p>
              <strong>
                {accountState.status === "success"
                  ? formatMoney(
                      accountState.data.account.buyingPower,
                      accountState.data.account.currency,
                    )
                  : "Not available"}
              </strong>
            </article>
            <article className="metric-card">
              <p>Cash</p>
              <strong>
                {accountState.status === "success"
                  ? formatMoney(
                      accountState.data.account.cash,
                      accountState.data.account.currency,
                    )
                  : "Not available"}
              </strong>
            </article>
          </section>

          <section className="dashboard-panel" aria-labelledby="opportunities-heading">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Spread candidates</p>
                <h2 id="opportunities-heading">Top opportunities</h2>
              </div>
              <Link className="text-link" href={`/spreads/${watchSymbol}`}>
                Review all
              </Link>
            </div>

            {candidatesState.status === "loading" ? (
              <div className="loading-grid chain-loading" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : null}

            {candidatesState.status === "error" ? (
              <div className="empty-state" role="alert">
                <strong>Candidate scan unavailable</strong>
                <p>{candidatesState.message}</p>
              </div>
            ) : null}

            {candidatesState.status === "success" && topCandidates.length > 0 ? (
              <div className="opportunity-table" role="table">
                <div className="opportunity-row opportunity-head" role="row">
                  <span>Strategy</span>
                  <span>Score</span>
                  <span>Expiry</span>
                  <span>Premium</span>
                  <span>Max loss</span>
                </div>
                {topCandidates.map((candidate) => (
                  <Link
                    className="opportunity-row"
                    href={`/spreads/${watchSymbol}`}
                    key={candidate.id}
                    role="row"
                  >
                    <span>
                      <strong>{strategyLabels[candidate.strategy]}</strong>
                      <small>
                        {candidate.width} wide · {candidate.type}
                      </small>
                    </span>
                    <span>
                      {candidate.scoreGrade} · {candidate.score}
                      <small>{candidate.rewardRiskRatio.toFixed(2)}:1 R/R</small>
                    </span>
                    <span>
                      {formatDate(candidate.expirationDate)}
                      <small>{candidate.dte} DTE</small>
                    </span>
                    <span>{getPremiumLabel(candidate)}</span>
                    <span>{formatMoney(candidate.maxLoss)}</span>
                  </Link>
                ))}
              </div>
            ) : null}

            {candidatesState.status === "success" && topCandidates.length === 0 ? (
              <div className="empty-state">
                <strong>No candidates passed checks</strong>
                <p>
                  {formatWholeNumber(candidatesState.data.rejectedCount)} spreads
                  were rejected by the active risk profile.
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="dashboard-rail" aria-label="Risk and activity">
          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Risk profile</p>
                <h2>Active limits</h2>
              </div>
            </div>
            <div className="risk-limit-list">
              <div>
                <span>Max loss</span>
                <strong>{formatMoney(riskProfile.maxLoss)}</strong>
              </div>
              <div>
                <span>DTE range</span>
                <strong>
                  {riskProfile.minDte}-{riskProfile.maxDte}
                </strong>
              </div>
              <div>
                <span>Bid/ask width</span>
                <strong>{formatMoney(riskProfile.maxBidAskWidth)}</strong>
              </div>
              <div>
                <span>Trades today</span>
                <strong>
                  {riskProfile.currentTradesToday}/{riskProfile.maxTradesPerDay}
                </strong>
              </div>
              <div>
                <span>Open trades</span>
                <strong>
                  {riskProfile.currentOpenTrades}/{riskProfile.maxOpenTrades}
                </strong>
              </div>
              <div>
                <span>Daily risk</span>
                <strong>
                  {formatMoney(riskProfile.currentDailyRisk)} /{" "}
                  {formatMoney(riskProfile.maxDailyRisk)}
                </strong>
              </div>
              <div>
                <span>Minimum OI</span>
                <strong>{formatWholeNumber(riskProfile.minOpenInterest)}</strong>
              </div>
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Activity</p>
                <h2>Latest refresh</h2>
              </div>
            </div>
            <div className="activity-list">
              <div>
                <span>Account</span>
                <strong>
                  {accountState.status === "success"
                    ? formatDateTime(accountState.data.fetchedAt)
                    : accountState.status}
                </strong>
              </div>
              <div>
                <span>Candidates</span>
                <strong>
                  {candidatesState.status === "success"
                    ? formatDateTime(candidatesState.data.fetchedAt)
                    : candidatesState.status}
                </strong>
              </div>
              <div>
                <span>Paper orders</span>
                <strong>
                  {journalState.status === "success"
                    ? formatDateTime(journalState.data.fetchedAt)
                    : journalState.status}
                </strong>
              </div>
            </div>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-label">Journal</p>
                <h2>Recent orders</h2>
              </div>
              <Link className="text-link" href="/journal">
                Review
              </Link>
            </div>
            {journalState.status === "loading" ? (
              <div className="loading-grid" aria-hidden="true">
                <span />
                <span />
              </div>
            ) : null}
            {journalState.status === "error" ? (
              <div className="empty-state" role="alert">
                <strong>Journal unavailable</strong>
                <p>{journalState.message}</p>
              </div>
            ) : null}
            {journalState.status === "success" && latestOrders.length === 0 ? (
              <div className="empty-state">
                <strong>No paper orders journaled</strong>
                <p>Preview and submit a paper order to start the audit trail.</p>
              </div>
            ) : null}
            {journalState.status === "success" && latestOrders.length > 0 ? (
              <div className="activity-list">
                {latestOrders.map((order) => (
                  <div key={order.id}>
                    <span>{strategyLabels[order.strategy]}</span>
                    <strong>{order.status}</strong>
                    <small>
                      {order.underlyingSymbol} · {formatMoney(order.estimatedMaxLoss)}{" "}
                      risk · score {order.score}
                    </small>
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
