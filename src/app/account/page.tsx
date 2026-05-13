import Link from "next/link";
import { AccountDashboard } from "@/features/account/components/account-dashboard";

export default function AccountPage() {
  return (
    <main className="app-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Paper account</p>
          <h1>Account Dashboard</h1>
          <p className="lede">
            Reads Alpaca account information through a server API route. Browser
            code never receives Alpaca credentials.
          </p>
        </div>
        <Link className="button secondary" href="/">
          Overview
        </Link>
      </section>

      <AccountDashboard />
    </main>
  );
}
