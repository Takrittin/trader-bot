"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { KillSwitchStatus } from "@/features/kill-switch/types";
import {
  PAPER_ORDER_CONFIRMATION_PHRASE,
  type PaperMlegOrderErrorResponse,
  type PaperMlegOrderPreviewRequest,
  type PaperMlegOrderPreviewResponse,
  type PaperMlegOrderSubmitRequest,
  type PaperMlegOrderSubmitResponse,
} from "@/features/orders/types";
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

type PaperOrderState =
  | { status: "idle" }
  | { candidateId: string; status: "loading" }
  | { message: string; status: "error" }
  | {
      confirmation: string;
      data: PaperMlegOrderPreviewResponse;
      status: "ready";
      submitted?: PaperMlegOrderSubmitResponse;
      submitError?: string;
      submitting: boolean;
      submitMessage?: string;
    };

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

async function parseJsonApiResponse<TResponse extends object>(
  response: Response,
  fallbackError: string,
): Promise<TResponse> {
  const body = (await response.json().catch(() => ({}))) as
    | TResponse
    | PaperMlegOrderErrorResponse;

  if (!response.ok) {
    throw new Error("error" in body ? body.error : fallbackError);
  }

  return body as TResponse;
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
  const [quantity, setQuantity] = useState(1);
  const [orderState, setOrderState] = useState<PaperOrderState>({
    status: "idle",
  });
  const [killSwitch, setKillSwitch] = useState<KillSwitchStatus | null>(null);
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);
  const [killSwitchError, setKillSwitchError] = useState<string | null>(null);
  const [killSwitchMessage, setKillSwitchMessage] = useState<string | null>(
    null,
  );

  const loadCandidates = useCallback(async (nextFormState: CandidateFormState) => {
    setState({ status: "loading" });
    setOrderState({ status: "idle" });

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

    async function loadKillSwitchStatus() {
      try {
        const response = await fetch("/api/kill-switch", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await parseJsonApiResponse<KillSwitchStatus>(
          response,
          "Unable to load order submission status.",
        );

        setKillSwitch(data);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setKillSwitchError(
          error instanceof Error
            ? error.message
            : "Unable to load order submission status.",
        );
      }
    }

    void loadKillSwitchStatus();

    return () => controller.abort();
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
      `Paper trades ${profile.currentTradesToday}/${profile.maxTradesPerDay}`,
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

  function buildPaperOrderRequest(
    candidateId: string,
    source: VerticalSpreadCandidatesResponse,
  ): PaperMlegOrderPreviewRequest {
    const riskProfile = source.riskProfile;

    return {
      candidateId,
      limit: formState.limit,
      quantity,
      riskProfile: {
        maxBidAskWidth: riskProfile.maxBidAskWidth,
        maxDte: riskProfile.maxDte,
        maxLoss: riskProfile.maxLoss,
        maxTradesPerDay: riskProfile.maxTradesPerDay,
        minDte: riskProfile.minDte,
      },
    };
  }

  function buildPaperSubmitRequest(
    readyState: Extract<PaperOrderState, { status: "ready" }>,
  ): PaperMlegOrderSubmitRequest {
    const { preview } = readyState.data;

    return {
      candidateId: preview.candidate.id,
      confirmation: readyState.confirmation,
      limit: formState.limit,
      quantity: preview.quantity,
      riskProfile: {
        maxBidAskWidth: preview.riskProfile.maxBidAskWidth,
        maxDte: preview.riskProfile.maxDte,
        maxLoss: preview.riskProfile.maxLoss,
        maxTradesPerDay: preview.riskProfile.maxTradesPerDay,
        minDte: preview.riskProfile.minDte,
      },
    };
  }

  async function previewPaperOrder(candidateId: string) {
    if (state.status !== "success") {
      return;
    }

    setOrderState({ candidateId, status: "loading" });

    try {
      const response = await fetch(
        `/api/alpaca/spreads/${encodeURIComponent(symbol)}/orders/preview`,
        {
          body: JSON.stringify(buildPaperOrderRequest(candidateId, state.data)),
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const data = await parseJsonApiResponse<PaperMlegOrderPreviewResponse>(
        response,
        "Unable to preview the paper mleg order.",
      );

      setKillSwitch({
        submissionsDisabled: data.preview.submissionsDisabled,
      });
      setOrderState({
        confirmation: "",
        data,
        status: "ready",
        submitting: false,
      });
    } catch (error) {
      setOrderState({
        message:
          error instanceof Error
            ? error.message
            : "Unable to preview the paper mleg order.",
        status: "error",
      });
    }
  }

  async function submitPaperOrder() {
    if (orderState.status !== "ready") {
      return;
    }

    const readyState = orderState;

    setOrderState({
      ...readyState,
      submitError: undefined,
      submitMessage: undefined,
      submitting: true,
    });

    try {
      const response = await fetch(
        `/api/alpaca/spreads/${encodeURIComponent(symbol)}/orders/submit`,
        {
          body: JSON.stringify(buildPaperSubmitRequest(readyState)),
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
      const data = await parseJsonApiResponse<PaperMlegOrderSubmitResponse>(
        response,
        "Unable to submit the paper mleg order.",
      );

      setKillSwitch({
        submissionsDisabled: data.preview.submissionsDisabled,
      });
      setOrderState({
        ...readyState,
        confirmation: "",
        data: {
          fetchedAt: data.submittedAt,
          preview: data.preview,
          underlyingSymbol: data.underlyingSymbol,
        },
        status: "ready",
        submitted: data,
        submitError: undefined,
        submitting: false,
        submitMessage: `Paper order ${data.order.id} submitted with status ${data.order.status}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to submit the paper mleg order.";

      if (message.includes("kill switch")) {
        setKillSwitch({ submissionsDisabled: true });
      }

      setOrderState({
        ...readyState,
        status: "ready",
        submitError: message,
        submitMessage: undefined,
        submitting: false,
      });
    }
  }

  async function updateKillSwitch(nextValue: boolean) {
    setKillSwitchBusy(true);
    setKillSwitchError(null);
    setKillSwitchMessage(null);

    try {
      const response = await fetch("/api/kill-switch", {
        body: JSON.stringify({ submissionsDisabled: nextValue }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = await parseJsonApiResponse<KillSwitchStatus>(
        response,
        "Unable to update order submission status.",
      );

      setKillSwitch(data);
      setKillSwitchMessage(
        data.submissionsDisabled
          ? "Paper order submissions disabled."
          : "Paper order submissions enabled.",
      );
    } catch (error) {
      setKillSwitchError(
        error instanceof Error
          ? error.message
          : "Unable to update order submission status.",
      );
    } finally {
      setKillSwitchBusy(false);
    }
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

  const readyOrderState = orderState.status === "ready" ? orderState : null;
  const readyOrderSubmissionsDisabled = readyOrderState
    ? (killSwitch?.submissionsDisabled ??
      readyOrderState.data.preview.submissionsDisabled)
    : false;
  const readyOrderCanSubmit = Boolean(
    readyOrderState &&
      !readyOrderSubmissionsDisabled &&
      !readyOrderState.submitting &&
      readyOrderState.confirmation === PAPER_ORDER_CONFIRMATION_PHRASE,
  );

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
            Order qty
            <input
              min={1}
              max={10}
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
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

      <section
        className={`kill-switch-panel ${
          killSwitch?.submissionsDisabled ? "is-disabled" : ""
        }`}
        aria-live="polite"
      >
        <div className="kill-switch-copy">
          <p className="panel-label">Paper submissions</p>
          <strong>
            {killSwitch?.submissionsDisabled
              ? "Kill switch active"
              : "Submissions enabled"}
          </strong>
          {killSwitchMessage ? <p>{killSwitchMessage}</p> : null}
          {killSwitchError ? (
            <p className="form-error">{killSwitchError}</p>
          ) : null}
        </div>
        <div className="kill-switch-actions">
          <button
            className="button danger"
            type="button"
            disabled={killSwitchBusy || killSwitch?.submissionsDisabled === true}
            onClick={() => void updateKillSwitch(true)}
          >
            Disable
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={killSwitchBusy || killSwitch?.submissionsDisabled === false}
            onClick={() => void updateKillSwitch(false)}
          >
            Enable
          </button>
        </div>
      </section>

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

          {orderState.status === "loading" ? (
            <section className="account-card paper-order-panel" aria-busy="true">
              <p className="panel-label">Paper order preview</p>
              <h2>Preparing Alpaca mleg order</h2>
              <p className="muted">
                Selected candidate {orderState.candidateId}
              </p>
              <div className="loading-grid chain-loading" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
            </section>
          ) : null}

          {orderState.status === "error" ? (
            <section className="account-card error-card" role="alert">
              <p className="panel-label">Paper order unavailable</p>
              <h2>Could not preview order</h2>
              <p>{orderState.message}</p>
            </section>
          ) : null}

          {readyOrderState ? (
            <section className="account-card paper-order-panel" aria-live="polite">
              <div className="paper-order-header">
                <div>
                  <p className="panel-label">Paper order preview</p>
                  <h2>
                    {strategyLabels[readyOrderState.data.preview.candidate.strategy]}
                  </h2>
                </div>
                <span className="option-type call">mleg limit</span>
              </div>

              <div className="paper-order-summary">
                <div>
                  <span>Quantity</span>
                  <strong>{readyOrderState.data.preview.order.qty}</strong>
                </div>
                <div>
                  <span>Limit price</span>
                  <strong>
                    {formatCurrency(
                      Number(readyOrderState.data.preview.order.limit_price),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Estimated max loss</span>
                  <strong>
                    {formatCurrency(readyOrderState.data.preview.estimatedMaxLoss)}
                  </strong>
                </div>
                <div>
                  <span>Estimated max profit</span>
                  <strong>
                    {formatCurrency(
                      readyOrderState.data.preview.estimatedMaxProfit,
                    )}
                  </strong>
                </div>
              </div>

              <div className="legs-table paper-order-legs" aria-label="Order legs">
                {readyOrderState.data.preview.order.legs.map((leg) => (
                  <div key={`${readyOrderState.data.preview.candidate.id}:${leg.symbol}`}>
                    <span>{leg.side}</span>
                    <strong>{leg.symbol}</strong>
                    <small>{leg.position_intent}</small>
                    <small>Ratio {leg.ratio_qty}</small>
                  </div>
                ))}
              </div>

              <ul className="risk-check-list">
                {readyOrderState.data.preview.riskChecks.map((check) => (
                  <li key={`preview:${check.name}`}>
                    <span>{check.label}</span>
                    <strong>{check.value}</strong>
                    <small>{check.limit}</small>
                  </li>
                ))}
              </ul>

              {readyOrderSubmissionsDisabled ? (
                <p className="paper-order-warning" role="status">
                  Kill switch active. Paper order submission is disabled.
                </p>
              ) : null}

              <label className="paper-order-confirmation">
                Type {PAPER_ORDER_CONFIRMATION_PHRASE} to submit
                <input
                  autoComplete="off"
                  value={readyOrderState.confirmation}
                  onChange={(event) => {
                    const nextConfirmation = event.target.value;

                    setOrderState((current) =>
                      current.status === "ready"
                        ? {
                            ...current,
                            confirmation: nextConfirmation,
                            submitError: undefined,
                          }
                        : current,
                    );
                  }}
                />
              </label>

              <div className="paper-order-actions">
                <button
                  className="button"
                  type="button"
                  disabled={!readyOrderCanSubmit}
                  onClick={() => void submitPaperOrder()}
                >
                  {readyOrderState.submitting
                    ? "Submitting..."
                    : "Submit paper order"}
                </button>
                {readyOrderState.submitError ? (
                  <p className="form-error">{readyOrderState.submitError}</p>
                ) : null}
                {readyOrderState.submitMessage ? (
                  <p className="form-success">{readyOrderState.submitMessage}</p>
                ) : null}
                {readyOrderState.submitted ? (
                  <p className="muted">
                    Client order{" "}
                    {readyOrderState.submitted.order.client_order_id ??
                      "generated by Alpaca"}
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

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

                  <div className="candidate-actions">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={
                        quantity < 1 ||
                        quantity > 10 ||
                        (orderState.status === "loading" &&
                          orderState.candidateId === candidate.id)
                      }
                      onClick={() => void previewPaperOrder(candidate.id)}
                    >
                      {orderState.status === "loading" &&
                      orderState.candidateId === candidate.id
                        ? "Previewing..."
                        : "Preview paper order"}
                    </button>
                  </div>
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
