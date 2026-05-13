import { NextResponse } from "next/server";
import {
  areSubmissionsDisabled,
  setSubmissionsDisabled,
} from "@/features/kill-switch/state";
import type { KillSwitchStatus } from "@/features/kill-switch/types";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    submissionsDisabled: setSubmissionsDisabled(body.submissionsDisabled),
  });
}
