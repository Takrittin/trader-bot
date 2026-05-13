"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import {
  defaultVerticalSpreadRiskProfile,
  type VerticalSpreadRiskProfile,
} from "@/features/risk/types";
import type {
  VerticalSpreadCandidate,
  VerticalSpreadCandidatesErrorResponse,
  VerticalSpreadCandidatesResponse,
  VerticalSpreadStrategy,
} from "@/features/spreads/types";

type VerticalSpreadCandidatesProps = {
  symbol: string;
};

type CandidateState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { data: VerticalSpreadCandidatesResponse; status: "success" };

type CandidateFormState = VerticalSpreadRiskProfile & {
  limit: number;
  symbol: string;
};

const defaultFormState: CandidateFormState = {
  ...defaultVerticalSpreadRiskProfile,
  limit: 40,
  symbol: "SPY",
};

const strategyLabels: Record<VerticalSpreadStrategy, string> = {
  bear_call_credit: "Bear call credit",
  bear_put_debit: "Bear put debit",
  bull_call_debit: "Bull call debit",
  bull_put_credit: "Bull put credit",
};

function buildEndpoint(formState: CandidateFormState): string {
  const params = new URLSearchParams({
    currentTradesToday: String(formState.currentTradesToday),
    limit: String(formState.limit),
    maxBidAskWidth: String(formState.maxBidAskWidth),
    maxDte: String(formState.maxDte),
    maxLoss: String(formState.maxLoss),
    maxTradesPerDay: String(formState.maxTradesPerDay),
    minDte: String(formState.minDte),
  });

  return `/api/alpaca/spreads/${encodeURIComponent(
    formState.symbol,
  )}/candidates?${params}`;
}

async function parseCandidatesResponse(
  response: Response,
): Promise<VerticalSpreadCandidatesResponse> {
  const body = (await response.json()) as
    | VerticalSpreadCandidatesResponse
    | VerticalSpreadCandidatesErrorResponse;

  if (!response.ok) {
    throw new Error(
      "error" in body
        ? body.error
        : "Unable to generate vertical spread candidates.",
    );
  }

  return body as VerticalSpreadCandidatesResponse;
}

async function fetchCandidates(
  formState: CandidateFormState,
  signal?: AbortSignal,
): Promise<VerticalSpreadCandidatesResponse> {
  const response = await fetch(buildEndpoint(formState), {
    cache: "no-store",
    signal,
  });

  return parseCandidatesResponse(response);
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "Not applicable";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number | string | null, digits = 2): string {
  if (value === null) {
    return "Not available";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(number);
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
    year: "numeric",
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
    return `Debit ${formatCurrency(candidate.netDebit)}`;
  }

  return `Credit ${formatCurrency(candidate.netCredit)}`;
}

export function VerticalSpreadCandidates({
  symbol,
}: VerticalSpreadCandidatesProps) {
  const router = useRouter();
  const [formState, setFormState] = useState<CandidateFormState>({
    ...defaultFormState,
    symbol,
  });
  const [state, setState] = useState<CandidateState>({ status: "loading" });

  const loadCandidates = useCallback(async (nextFormState: CandidateFormState) => {
    setState({ status: "loading" });

    try {
      const data = await fetchCandidates(nextFormState);

      setState({ data, status: "success" });
    } catch (error) {
      setState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate vertical spread candidates.",
        status: "error",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initialFormState = { ...defaultFormState, symbol };

    async function loadInitialCandidates() {
      try {
        const data = await fetchCandidates(initialFormState, controller.signal);

        setState({ data, status: "success" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to generate vertical spread candidates.",
          status: "error",
        });
      }
    }

    void loadInitialCandidates();

    return () => controller.abort();
  }, [symbol]);

  const riskSummary = useMemo(() => {
    const profile =
      state.status === "success" ? state.data.riskProfile : formState;

    return [
      `Max loss ${formatCurrency(profile.maxLoss)}`,
      `${profile.minDte}-${profile.maxDte} DTE`,
      `Bid/ask <= ${formatCurrency(profile.maxBidAskWidth)}`,
      `Trades ${profile.currentTradesToday}/${profile.maxTradesPerDay}`,
    ];
  }, [formState, state]);

  function updateNumericField(
    field: keyof Omit<CandidateFormState, "symbol">,
    value: string,
  ) {
    setFormState((current) => ({
      ...current,
      [field]: Number(value),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSymbol = normalizeUnderlyingSymbol(formState.symbol);

    if (!nextSymbol) {
      setState({ message: "Invalid underlying symbol.", status: "error" });
      return;
    }

    const nextFormState = {
      ...formState,
      maxDte: Math.max(formState.minDte, formState.maxDte),
      symbol: nextSymbol,
    };

    setFormState(nextFormState);

    if (nextSymbol !== symbol) {
      router.push(`/spreads/${encodeURIComponent(nextSymbol)}`);
      return;
    }

    void loadCandidates(nextFormState);
  }

  return (
    <section className="spread-generator" aria-labelledby="spread-heading">
      <div className="chain-toolbar spread-toolbar">
        <div>
          <p className="panel-label">Vertical spreads</p>
          <h2 id="spread-heading">{symbol}</h2>
        </div>
        <form className="risk-form" onSubmit={handleSubmit}>
          <label>
            Symbol
            <input
              maxLength={10}
              value={formState.symbol}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  symbol: event.target.value.toUpperCase(),
                }))
              }
            />
          </label>
          <label>
            Max loss
            <input
              min={1}
              step={50}
              type="number"
              value={formState.maxLoss}
              onChange={(event) => updateNumericField("maxLoss", event.target.value)}
            />
          </label>
          <label>
            Min DTE
            <input
              min={1}
              type="number"
              value={formState.minDte}
              onChange={(event) => updateNumericField("minDte", event.target.value)}
            />
          </label>
          <label>
            Max DTE
            <input
              min={1}
              type="number"
              value={formState.maxDte}
              onChange={(event) => updateNumericField("maxDte", event.target.value)}
            />
          </label>
          <label>
            Max bid/ask
            <input
              min={0.01}
              step={0.05}
              type="number"
              value={formState.maxBidAskWidth}
              onChange={(event) =>
                updateNumericField("maxBidAskWidth", event.target.value)
              }
            />
          </label>
          <label>
            Trades today
            <input
              min={0}
              type="number"
              value={formState.currentTradesToday}
              onChange={(event) =>
                updateNumericField("currentTradesToday", event.target.value)
              }
            />
          </label>
          <label>
            Max trades/day
            <input
              min={1}
              type="number"
              value={formState.maxTradesPerDay}
              onChange={(event) =>
                updateNumericField("maxTradesPerDay", event.target.value)
              }
            />
          </label>
          <label>
            Candidate limit
            <input
              min={1}
              max={100}
              type="number"
              value={formState.limit}
              onChange={(event) => updateNumericField("limit", event.target.value)}
            />
          </label>
          <button className="button" type="submit">
            Generate
          </button>
        </form>
      </div>

      <div className="risk-summary" aria-label="Active risk checks">
        {riskSummary.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      {state.status === "loading" ? (
        <section className="account-card" aria-busy="true">
          <p className="panel-label">Candidates</p>
          <h2>Generating vertical spread candidates</h2>
          <div className="loading-grid chain-loading" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : null}

      {state.status === "error" ? (
        <section className="account-card error-card" role="alert">
          <p className="panel-label">Generator unavailable</p>
          <h2>Could not generate candidates</h2>
          <p>{state.message}</p>
          <button
            className="button"
            type="button"
            onClick={() => void loadCandidates(formState)}
          >
            Retry
          </button>
        </section>
      ) : null}

      {state.status === "success" ? (
        <>
          <div className="chain-stats">
            <div className="metric-card">
              <p>Candidates</p>
              <strong>{formatWholeNumber(state.data.candidates.length)}</strong>
            </div>
            <div className="metric-card">
              <p>Rejected by checks</p>
              <strong>{formatWholeNumber(state.data.rejectedCount)}</strong>
            </div>
            <div className="metric-card">
              <p>Generated</p>
              <strong>{formatDateTime(state.data.fetchedAt)}</strong>
            </div>
          </div>

          {state.data.candidates.length > 0 ? (
            <div className="candidate-grid">
              {state.data.candidates.map((candidate) => (
                <article className="candidate-card" key={candidate.id}>
                  <div className="candidate-header">
                    <div>
                      <p className="panel-label">
                        {strategyLabels[candidate.strategy]}
                      </p>
                      <h3>
                        {formatDate(candidate.expirationDate)} · {candidate.dte}{" "}
                        DTE
                      </h3>
                    </div>
                    <span className={`option-type ${candidate.type}`}>
                      {candidate.type}
                    </span>
                  </div>

                  <div className="candidate-metrics">
                    <div>
                      <span>Width</span>
                      <strong>{formatCurrency(candidate.width)}</strong>
                    </div>
                    <div>
                      <span>Premium</span>
                      <strong>{getPremiumLabel(candidate)}</strong>
                    </div>
                    <div>
                      <span>Max loss</span>
                      <strong>{formatCurrency(candidate.maxLoss)}</strong>
                    </div>
                    <div>
                      <span>Max profit</span>
                      <strong>{formatCurrency(candidate.maxProfit)}</strong>
                    </div>
                  </div>

                  <div className="legs-table" aria-label="Spread legs">
                    {candidate.legs.map((leg) => (
                      <div key={`${candidate.id}:${leg.symbol}`}>
                        <span>{leg.action}</span>
                        <strong>
                          {formatCurrency(leg.strike)} {candidate.type}
                        </strong>
                        <small>{leg.symbol}</small>
                        <small>
                          Bid {formatNumber(leg.bid)} · Ask {formatNumber(leg.ask)}
                        </small>
                        <small>
                          Delta {formatNumber(leg.delta, 4)} · Theta{" "}
                          {formatNumber(leg.theta, 4)}
                        </small>
                        <small>OI {leg.openInterest ?? "Not available"}</small>
                      </div>
                    ))}
                  </div>

                  <ul className="risk-check-list">
                    {candidate.riskChecks.map((check) => (
                      <li key={`${candidate.id}:${check.name}`}>
                        <span>{check.label}</span>
                        <strong>{check.value}</strong>
                        <small>{check.limit}</small>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <section className="account-card">
              <p className="panel-label">No candidates</p>
              <h2>No spreads passed the active risk checks</h2>
              <p className="muted">
                The generator scanned {formatWholeNumber(state.data.scannedSpreads)}{" "}
                spreads and rejected {formatWholeNumber(state.data.rejectedCount)}.
              </p>
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}
