import "server-only";

import { assertPaperTradingBaseUrl } from "@/lib/alpaca/constants";
import type {
  AlpacaAccount,
  AlpacaClock,
  AlpacaOptionContractsResponse,
  AlpacaOptionSnapshotsResponse,
  AlpacaPosition,
} from "@/lib/alpaca/types";
import { getServerEnv, type ServerEnv } from "@/lib/env/server";

type ReadonlyRequestOptions = {
  signal?: AbortSignal;
};

type OptionContractsParams = {
  expirationDateGte?: string;
  underlyingSymbols: string[];
  limit?: number;
  status?: "active" | "inactive";
};

type OptionSnapshotsParams = {
  expirationDateGte?: string;
  feed?: "opra" | "indicative";
  limit?: number;
};

export class AlpacaClientError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly responseBody: string,
  ) {
    super(`Alpaca request failed: ${status} ${statusText}`);
    this.name = "AlpacaClientError";
  }

  static async fromResponse(response: Response): Promise<AlpacaClientError> {
    const responseBody = await response.text().catch(() => "");

    return new AlpacaClientError(
      response.status,
      response.statusText,
      responseBody,
    );
  }
}

export class AlpacaPaperClient {
  private readonly tradingBaseUrl: string;
  private readonly dataBaseUrl: string;
  private readonly headers: HeadersInit;

  constructor(env: ServerEnv = getServerEnv()) {
    assertPaperTradingBaseUrl(env.alpaca.tradingBaseUrl);

    this.tradingBaseUrl = env.alpaca.tradingBaseUrl.replace(/\/+$/, "");
    this.dataBaseUrl = env.alpaca.dataBaseUrl.replace(/\/+$/, "");
    this.headers = {
      Accept: "application/json",
      "APCA-API-KEY-ID": env.alpaca.apiKeyId,
      "APCA-API-SECRET-KEY": env.alpaca.apiSecretKey,
    };
  }

  getAccount(options?: ReadonlyRequestOptions): Promise<AlpacaAccount> {
    return this.get("/v2/account", options);
  }

  getClock(options?: ReadonlyRequestOptions): Promise<AlpacaClock> {
    return this.get("/v2/clock", options);
  }

  getPositions(options?: ReadonlyRequestOptions): Promise<AlpacaPosition[]> {
    return this.get("/v2/positions", options);
  }

  getOptionContracts(
    params: OptionContractsParams,
    options?: ReadonlyRequestOptions,
  ): Promise<AlpacaOptionContractsResponse> {
    const searchParams = new URLSearchParams({
      underlying_symbols: params.underlyingSymbols.join(","),
      status: params.status ?? "active",
    });

    if (params.limit) {
      searchParams.set("limit", String(params.limit));
    }

    if (params.expirationDateGte) {
      searchParams.set("expiration_date_gte", params.expirationDateGte);
    }

    return this.get(`/v2/options/contracts?${searchParams}`, options);
  }

  getOptionChainSnapshots(
    underlyingSymbol: string,
    params: OptionSnapshotsParams = {},
    options?: ReadonlyRequestOptions,
  ): Promise<AlpacaOptionSnapshotsResponse> {
    const searchParams = new URLSearchParams();

    if (params.feed) {
      searchParams.set("feed", params.feed);
    }

    if (params.limit) {
      searchParams.set("limit", String(params.limit));
    }

    if (params.expirationDateGte) {
      searchParams.set("expiration_date_gte", params.expirationDateGte);
    }

    const query = searchParams.size > 0 ? `?${searchParams}` : "";
    const encodedSymbol = encodeURIComponent(underlyingSymbol);

    return this.getData(
      `/v1beta1/options/snapshots/${encodedSymbol}${query}`,
      options,
    );
  }

  // Keep the public client read-only until risk checks, logging, and paper order
  // preview flows are implemented.
  private async get<T>(
    path: `/${string}`,
    options?: ReadonlyRequestOptions,
  ): Promise<T> {
    const response = await fetch(`${this.tradingBaseUrl}${path}`, {
      cache: "no-store",
      headers: this.headers,
      method: "GET",
      signal: options?.signal,
    });

    if (!response.ok) {
      throw await AlpacaClientError.fromResponse(response);
    }

    return (await response.json()) as T;
  }

  private async getData<T>(
    path: `/${string}`,
    options?: ReadonlyRequestOptions,
  ): Promise<T> {
    const response = await fetch(`${this.dataBaseUrl}${path}`, {
      cache: "no-store",
      headers: this.headers,
      method: "GET",
      signal: options?.signal,
    });

    if (!response.ok) {
      throw await AlpacaClientError.fromResponse(response);
    }

    return (await response.json()) as T;
  }
}

export function createAlpacaPaperClient(env?: ServerEnv): AlpacaPaperClient {
  return new AlpacaPaperClient(env);
}
