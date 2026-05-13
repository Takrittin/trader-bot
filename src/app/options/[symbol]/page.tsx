import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OptionChain } from "@/features/options/components/option-chain";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";

type OptionChainPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

export async function generateMetadata({
  params,
}: OptionChainPageProps): Promise<Metadata> {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  return {
    title: symbol
      ? `${symbol} Option Chain | AutoTrade Options Bot`
      : "Option Chain | AutoTrade Options Bot",
  };
}

export default async function OptionChainPage({
  params,
}: OptionChainPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    notFound();
  }

  return (
    <main className="app-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Option chain</p>
          <h1>{symbol} Contracts</h1>
          <p className="lede">
            Contracts and market snapshots are fetched through server API routes.
            Alpaca credentials stay server-side.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Overview
        </Link>
      </section>

      <OptionChain key={symbol} symbol={symbol} />
    </main>
  );
}
