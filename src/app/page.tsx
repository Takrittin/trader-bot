import Link from "next/link";

const hardRules = [
  "Paper trading only",
  "No live orders",
  "No naked options",
  "No 0DTE",
  "No market orders for options",
  "Server-side Alpaca keys",
  "Risk checks before submission",
  "Every bot decision logged",
];

const phaseOneAreas = [
  "Account dashboard",
  "Option chain viewer",
  "Vertical spread candidate generator",
  "Risk check engine",
  "Paper order preview",
  "Paper order submit/cancel",
  "Trade log",
  "Emergency kill switch",
];

export default function Home() {
  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Paper mode scaffold</p>
          <h1>AutoTrade Options Bot</h1>
          <p className="lede">
            Initial Next.js foundation for defined-risk vertical spread workflows.
            Live trading and order submission are intentionally absent.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/account">
              Open account dashboard
            </Link>
            <Link className="button secondary" href="/options/SPY">
              Open SPY option chain
            </Link>
          </div>
        </div>
        <div className="mode-panel" aria-label="Trading mode status">
          <span className="status-dot" />
          <div>
            <p className="panel-label">Trading mode</p>
            <strong>Paper only</strong>
          </div>
        </div>
      </section>

      <section className="grid-section" aria-labelledby="guardrails-heading">
        <div>
          <h2 id="guardrails-heading">Guardrails</h2>
          <p>
            The scaffold starts with server-only credentials, paper endpoint
            validation, and no order mutation surface.
          </p>
        </div>
        <ul className="check-list">
          {hardRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="grid-section" aria-labelledby="phase-one-heading">
        <div>
          <h2 id="phase-one-heading">Phase 1 Structure</h2>
          <p>
            Feature folders are reserved for the domains in the spec while the
            shared Alpaca and environment modules live under src/lib.
          </p>
        </div>
        <ul className="feature-list">
          {phaseOneAreas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
