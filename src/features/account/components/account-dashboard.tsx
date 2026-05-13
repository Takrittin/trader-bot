"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AccountDashboardErrorResponse,
  AccountDashboardResponse,
} from "@/features/account/types";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AccountDashboardResponse };

const accountEndpoint = "/api/alpaca/account";

function formatMoney(value: string, currency: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return `${value} ${currency}`;
  }

  return new Intl.NumberFormat("en-US", {
    currency,
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

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

async function parseAccountResponse(
  response: Response,
): Promise<AccountDashboardResponse> {
  const body = (await response.json()) as
    | AccountDashboardResponse
    | AccountDashboardErrorResponse;

  if (!response.ok) {
    throw new Error(
      "error" in body ? body.error : "Unable to load Alpaca account.",
    );
  }

  return body as AccountDashboardResponse;
}

export function AccountDashboard() {
  const [state, setState] = useState<DashboardState>({ status: "loading" });

  const fetchAccount = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(accountEndpoint, {
      cache: "no-store",
      signal,
    });

    return parseAccountResponse(response);
  }, []);

  const loadAccount = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const data = await fetchAccount();
      setState({ data, status: "success" });
    } catch (error) {
      setState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to load Alpaca account.",
        status: "error",
      });
    }
  }, [fetchAccount]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialAccount() {
      try {
        const data = await fetchAccount(controller.signal);

        setState({ data, status: "success" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to load Alpaca account.",
          status: "error",
        });
      }
    }

    void loadInitialAccount();

    return () => controller.abort();
  }, [fetchAccount]);

  if (state.status === "loading") {
    return (
      <section className="account-card" aria-busy="true">
        <p className="panel-label">Account</p>
        <h2>Loading account information</h2>
        <div className="loading-grid" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="account-card error-card" role="alert">
        <p className="panel-label">Account unavailable</p>
        <h2>Could not load Alpaca account</h2>
        <p>{state.message}</p>
        <button className="button" type="button" onClick={() => void loadAccount()}>
          Retry
        </button>
      </section>
    );
  }

  const { account, fetchedAt } = state.data;
  const restrictionCount = [
    account.accountBlocked,
    account.tradingBlocked,
    account.transfersBlocked,
  ].filter(Boolean).length;

  return (
    <section className="account-dashboard" aria-labelledby="account-heading">
      <div className="account-card account-summary">
        <div>
          <p className="panel-label">Paper account</p>
          <h2 id="account-heading">{account.accountNumber}</h2>
          <p className="muted">
            Status: <strong>{account.status}</strong>
          </p>
        </div>
        <div className="mode-panel compact" aria-label="Account restriction status">
          <span className={restrictionCount > 0 ? "status-dot warning" : "status-dot"} />
          <div>
            <p className="panel-label">Restrictions</p>
            <strong>{restrictionCount}</strong>
          </div>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <p>Portfolio value</p>
          <strong>{formatMoney(account.portfolioValue, account.currency)}</strong>
        </div>
        <div className="metric-card">
          <p>Buying power</p>
          <strong>{formatMoney(account.buyingPower, account.currency)}</strong>
        </div>
        <div className="metric-card">
          <p>Cash</p>
          <strong>{formatMoney(account.cash, account.currency)}</strong>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <span>Pattern day trader</span>
          <strong>{yesNo(account.patternDayTrader)}</strong>
        </div>
        <div>
          <span>Trading blocked</span>
          <strong>{yesNo(account.tradingBlocked)}</strong>
        </div>
        <div>
          <span>Transfers blocked</span>
          <strong>{yesNo(account.transfersBlocked)}</strong>
        </div>
        <div>
          <span>Account blocked</span>
          <strong>{yesNo(account.accountBlocked)}</strong>
        </div>
        <div>
          <span>Options approved level</span>
          <strong>{account.optionsApprovedLevel ?? "Not reported"}</strong>
        </div>
        <div>
          <span>Options trading level</span>
          <strong>{account.optionsTradingLevel ?? "Not reported"}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{formatDateTime(account.createdAt)}</strong>
        </div>
        <div>
          <span>Fetched</span>
          <strong>{formatDateTime(fetchedAt)}</strong>
        </div>
      </div>
    </section>
  );
}
