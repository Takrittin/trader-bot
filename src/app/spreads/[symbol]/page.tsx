import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { normalizeUnderlyingSymbol } from "@/features/options/symbol";
import { VerticalSpreadCandidates } from "@/features/spreads/components/vertical-spread-candidates";

type SpreadCandidatesPageProps = {
  params: Promise<{
    symbol: string;
  }>;
};

export async function generateMetadata({
  params,
}: SpreadCandidatesPageProps): Promise<Metadata> {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  return {
    title: symbol
      ? `${symbol} Vertical Spread Candidates | AutoTrade Options Bot`
      : "Vertical Spread Candidates | AutoTrade Options Bot",
  };
}

export default async function SpreadCandidatesPage({
  params,
}: SpreadCandidatesPageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeUnderlyingSymbol(rawSymbol);

  if (!symbol) {
    notFound();
  }

  return (
    <main className="app-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Candidate generator</p>
          <h1>{symbol} Vertical Spreads</h1>
          <p className="lede">
            Generates defined-risk vertical spread candidates only. No order
            submission code is present in this workflow.
          </p>
        </div>
        <div className="page-actions">
          <Link className="button secondary" href={`/options/${symbol}`}>
            Option chain
          </Link>
          <Link className="button secondary" href="/">
            Overview
          </Link>
        </div>
      </section>

      <VerticalSpreadCandidates symbol={symbol} />
    </main>
  );
}
