import "server-only";

import { getServerEnv } from "@/lib/env/server";

const environmentSubmissionsDisabled = getServerEnv().orderSubmissionsDisabled;
let runtimeSubmissionsDisabled = false;

export function areSubmissionsDisabled(): boolean {
  return environmentSubmissionsDisabled || runtimeSubmissionsDisabled;
}

export function setSubmissionsDisabled(nextValue: boolean): boolean {
  runtimeSubmissionsDisabled = nextValue;
  return areSubmissionsDisabled();
}
