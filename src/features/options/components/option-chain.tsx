"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  OptionChainErrorResponse,
  OptionContractsResponse,
  OptionContractSummary,
  OptionSnapshotsResponse,
  OptionSnapshotSummary,
} from "@/features/options/types";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";

type OptionChainProps = {
  symbol: string;
};

type OptionChainRow = OptionContractSummary & {
  ask: number | null;
  bid: number | null;
  delta: number | null;
  theta: number | null;
};

type OptionChainState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      contractsFetchedAt: string;
      rows: OptionChainRow[];
      snapshotsFetchedAt: string;
      status: "success";
    };

const missingValue = "Not available";

function buildEndpoint(symbol: string, resource: "contracts" | "snapshots") {
  return `/api/alpaca/options/${encodeURIComponent(symbol)}/${resource}`;
}

async function parseJsonResponse<T extends object>(response: Response): Promise<T> {
  const body = (await response.json()) as T | OptionChainErrorResponse;

  if (!response.ok) {
    throw new Error("error" in body ? body.error : "Unable to load option data.");
  }

  return body as T;
}

async function fetchOptionChain(
  symbol: string,
  signal?: AbortSignal,
): Promise<{
  contracts: OptionContractsResponse;
  snapshots: OptionSnapshotsResponse;
}> {
  const [contractsResponse, snapshotsResponse] = await Promise.all([
    fetch(buildEndpoint(symbol, "contracts"), {
      cache: "no-store",
      signal,
    }),
    fetch(buildEndpoint(symbol, "snapshots"), {
      cache: "no-store",
      signal,
    }),
  ]);

  const [contracts, snapshots] = await Promise.all([
    parseJsonResponse<OptionContractsResponse>(contractsResponse),
    parseJsonResponse<OptionSnapshotsResponse>(snapshotsResponse),
  ]);

  return { contracts, snapshots };
}

function toRows(
  contracts: OptionContractSummary[],
  snapshots: Record<string, OptionSnapshotSummary>,
): OptionChainRow[] {
  return contracts
    .map((contract) => {
      const snapshot = snapshots[contract.symbol];

      return {
        ...contract,
        ask: snapshot?.ask ?? null,
        bid: snapshot?.bid ?? null,
        delta: snapshot?.delta ?? null,
        theta: snapshot?.theta ?? null,
      };
    })
    .toSorted((left, right) => {
      const expirationSort = left.expirationDate.localeCompare(
        right.expirationDate,
      );

      if (expirationSort !== 0) {
        return expirationSort;
      }

      const strikeSort = Number(left.strikePrice) - Number(right.strikePrice);

      if (strikeSort !== 0) {
        return strikeSort;
      }

      return left.type.localeCompare(right.type);
    });
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

function formatNumber(value: number | string | null, digits = 2): string {
  if (value === null) {
    return missingValue;
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

function formatOpenInterest(value: string | null): string {
  if (!value) {
    return missingValue;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(number);
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

export function OptionChain({ symbol }: OptionChainProps) {
  const router = useRouter();
  const [symbolInput, setSymbolInput] = useState(symbol);
  const [state, setState] = useState<OptionChainState>({ status: "loading" });

  const loadOptionChain = useCallback(async () => {
    setState({ status: "loading" });

    try {
      const { contracts, snapshots } = await fetchOptionChain(symbol);

      setState({
        contractsFetchedAt: contracts.fetchedAt,
        rows: toRows(contracts.contracts, snapshots.snapshots),
        snapshotsFetchedAt: snapshots.fetchedAt,
        status: "success",
      });
    } catch (error) {
      setState({
        message:
          error instanceof Error ? error.message : "Unable to load option data.",
        status: "error",
      });
    }
  }, [symbol]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialOptionChain() {
      try {
        const { contracts, snapshots } = await fetchOptionChain(
          symbol,
          controller.signal,
        );

        setState({
          contractsFetchedAt: contracts.fetchedAt,
          rows: toRows(contracts.contracts, snapshots.snapshots),
          snapshotsFetchedAt: snapshots.fetchedAt,
          status: "success",
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          message:
            error instanceof Error
              ? error.message
              : "Unable to load option data.",
          status: "error",
        });
      }
    }

    void loadInitialOptionChain();

    return () => controller.abort();
  }, [symbol]);

  const groupedRowCount = useMemo(() => {
    if (state.status !== "success") {
      return 0;
    }

    return new Set(state.rows.map((row) => row.expirationDate)).size;
  }, [state]);

  function handleSymbolSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextSymbol = normalizeUnderlyingSymbol(symbolInput);

    if (nextSymbol) {
      router.push(`/options/${encodeURIComponent(nextSymbol)}`);
    }
  }

  return (
    <section className="option-chain" aria-labelledby="option-chain-heading">
      <div className="chain-toolbar">
        <div>
          <p className="panel-label">Underlying</p>
          <h2 id="option-chain-heading">{symbol}</h2>
        </div>
        <form className="symbol-form" onSubmit={handleSymbolSubmit}>
          <label htmlFor="underlying-symbol">Change symbol</label>
          <div>
            <input
              id="underlying-symbol"
              maxLength={10}
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value)}
            />
            <button className="button" type="submit">
              Load chain
            </button>
          </div>
        </form>
      </div>

      {state.status === "loading" ? (
        <section className="account-card" aria-busy="true">
          <p className="panel-label">Option chain</p>
          <h2>Loading option contracts and snapshots</h2>
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
          <p className="panel-label">Option chain unavailable</p>
          <h2>Could not load option chain</h2>
          <p>{state.message}</p>
          <button
            className="button"
            type="button"
            onClick={() => void loadOptionChain()}
          >
            Retry
          </button>
        </section>
      ) : null}

      {state.status === "success" ? (
        <>
          <div className="chain-stats">
            <div className="metric-card">
              <p>Contracts</p>
              <strong>{state.rows.length}</strong>
            </div>
            <div className="metric-card">
              <p>Expirations</p>
              <strong>{groupedRowCount}</strong>
            </div>
            <div className="metric-card">
              <p>Snapshots fetched</p>
              <strong>{formatDateTime(state.snapshotsFetchedAt)}</strong>
            </div>
          </div>

          {state.rows.length > 0 ? (
            <div className="table-shell">
              <table className="chain-table">
                <thead>
                  <tr>
                    <th scope="col">Expiration</th>
                    <th scope="col">Strike</th>
                    <th scope="col">Type</th>
                    <th scope="col">Bid</th>
                    <th scope="col">Ask</th>
                    <th scope="col">Delta</th>
                    <th scope="col">Theta</th>
                    <th scope="col">Open interest</th>
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row) => (
                    <tr key={row.symbol}>
                      <td>
                        <span>{formatDate(row.expirationDate)}</span>
                        <small>{row.symbol}</small>
                      </td>
                      <td>{formatNumber(row.strikePrice)}</td>
                      <td>
                        <span className={`option-type ${row.type}`}>
                          {row.type}
                        </span>
                      </td>
                      <td>{formatNumber(row.bid)}</td>
                      <td>{formatNumber(row.ask)}</td>
                      <td>{formatNumber(row.delta, 4)}</td>
                      <td>{formatNumber(row.theta, 4)}</td>
                      <td>{formatOpenInterest(row.openInterest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <section className="account-card">
              <p className="panel-label">No contracts</p>
              <h2>No active option contracts returned</h2>
              <p className="muted">
                Alpaca returned no active option contracts for {symbol} with the
                current default filters.
              </p>
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}
