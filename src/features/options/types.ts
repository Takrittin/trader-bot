export type OptionContractSummary = {
  symbol: string;
  expirationDate: string;
  strikePrice: string;
  type: "call" | "put";
  openInterest: string | null;
};

export type OptionSnapshotSummary = {
  symbol: string;
  bid: number | null;
  ask: number | null;
  delta: number | null;
  theta: number | null;
};

export type OptionContractsResponse = {
  contracts: OptionContractSummary[];
  fetchedAt: string;
  nextPageToken: string | null;
  underlyingSymbol: string;
};

export type OptionSnapshotsResponse = {
  fetchedAt: string;
  nextPageToken: string | null;
  snapshots: Record<string, OptionSnapshotSummary>;
  underlyingSymbol: string;
};

export type OptionChainErrorResponse = {
  error: string;
};
