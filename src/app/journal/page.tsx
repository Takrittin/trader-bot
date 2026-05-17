import type { Metadata } from "next";
import { JournalDashboard } from "@/features/journal/components/journal-dashboard";

export const metadata: Metadata = {
  title: "Paper Journal | AutoTrade Options Bot",
};

export default function JournalPage() {
  return <JournalDashboard />;
}
