"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    description: "Operations overview",
    href: "/",
    label: "Dashboard",
    matcher: (pathname: string) => pathname === "/",
  },
  {
    description: "Portfolio and permissions",
    href: "/account",
    label: "Account",
    matcher: (pathname: string) => pathname.startsWith("/account"),
  },
  {
    description: "Contracts and snapshots",
    href: "/options/SPY",
    label: "Option Chain",
    matcher: (pathname: string) => pathname.startsWith("/options"),
  },
  {
    description: "Candles and volume",
    href: "/charts/SPY",
    label: "Charts",
    matcher: (pathname: string) => pathname.startsWith("/charts"),
  },
  {
    description: "Risk-checked ideas",
    href: "/spreads/SPY",
    label: "Spread Candidates",
    matcher: (pathname: string) => pathname.startsWith("/spreads"),
  },
  {
    description: "Orders and audit trail",
    href: "/journal",
    label: "Journal",
    matcher: (pathname: string) => pathname.startsWith("/journal"),
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand">
        <Link href="/" aria-label="AutoTrade dashboard">
          <span className="brand-mark">AT</span>
          <span>
            <strong>AutoTrade</strong>
            <small>Options Bot</small>
          </span>
        </Link>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = item.matcher(pathname);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={active ? "sidebar-link is-active" : "sidebar-link"}
              href={item.href}
              key={item.href}
            >
              <span className="sidebar-link-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-status" aria-label="Trading environment">
        <span className="status-dot" />
        <div>
          <p className="panel-label">Mode</p>
          <strong>Paper only</strong>
          <small>No live orders</small>
        </div>
      </div>
    </aside>
  );
}
