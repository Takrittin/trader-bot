import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceChart } from "@/features/market/components/price-chart";
import {
  getStockBarsErrorMessage,
  loadStockBars,
} from "@/features/market/server";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";

type ChartPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

export async function generateMetadata({
  params,
}: ChartPageProps): Promise<Metadata> {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  return {
    title: symbol
      ? `${symbol} Price Chart | AutoTrade Options Bot`
      : "Price Chart | AutoTrade Options Bot",
  };
}

export default async function ChartPage({ params }: ChartPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    notFound();
  }

  let initialData = null;
  let initialError = null;

  try {
    initialData = await loadStockBars({ symbol });
  } catch (error) {
    console.error("Initial stock bars request failed", error);
    initialError = getStockBarsErrorMessage(error);
  }

  return (
    <main className="app-shell workspace-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Market bars</p>
          <h1>{symbol} Price Chart</h1>
          <p className="lede">
            Candles and volume bars are loaded through a server API route. Alpaca
            credentials stay server-side.
          </p>
        </div>
        <div className="page-actions">
          <Link className="button secondary" href={`/options/${symbol}`}>
            Option chain
          </Link>
          <Link className="button secondary" href={`/spreads/${symbol}`}>
            Spread candidates
          </Link>
        </div>
      </section>

      <PriceChart
        initialData={initialData}
        initialError={initialError}
        key={symbol}
        symbol={symbol}
      />
    </main>
  );
}
