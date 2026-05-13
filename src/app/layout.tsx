import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppSidebar } from "@/app/components/app-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoTrade Options Bot",
  description: "Paper trading dashboard for defined-risk options workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-frame">
          <AppSidebar />
          <div className="app-main">{children}</div>
        </div>
      </body>
    </html>
  );
}
