import { NextResponse } from "next/server";
import { listAuditEvents } from "@/features/journal/database";
import type {
  JournalAuditListResponse,
  JournalErrorResponse,
} from "@/features/journal/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse<JournalAuditListResponse | JournalErrorResponse> {
  try {
    return NextResponse.json({
      events: listAuditEvents(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Unable to load audit journal", error);

    return NextResponse.json(
      { error: "Unable to load audit journal." },
      { status: 500 },
    );
  }
}
