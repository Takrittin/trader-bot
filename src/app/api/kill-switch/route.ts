import { NextResponse } from "next/server";
import {
  areSubmissionsDisabled,
  setSubmissionsDisabled,
} from "@/features/kill-switch/state";
import { recordAuditEvent } from "@/features/journal/database";
import type { KillSwitchStatus } from "@/features/kill-switch/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse<KillSwitchStatus> {
  return NextResponse.json({
    submissionsDisabled: areSubmissionsDisabled(),
  });
}

export async function POST(request: Request): Promise<NextResponse<KillSwitchStatus>> {
  const body = (await request.json().catch(() => null)) as {
    submissionsDisabled?: unknown;
  } | null;

  if (typeof body?.submissionsDisabled !== "boolean") {
    return NextResponse.json(
      { submissionsDisabled: areSubmissionsDisabled() },
      { status: 400 },
    );
  }

  const submissionsDisabled = setSubmissionsDisabled(body.submissionsDisabled);

  recordAuditEvent({
    details: {
      requestedSubmissionsDisabled: body.submissionsDisabled,
      submissionsDisabled,
    },
    eventType: "kill_switch_updated",
  });

  return NextResponse.json({ submissionsDisabled });
}
