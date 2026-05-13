export function getIsoDateOffset(days: number, now = new Date()): string {
  const nextDate = new Date(now);

  nextDate.setUTCDate(nextDate.getUTCDate() + days);

  return nextDate.toISOString().slice(0, 10);
}

export function getTomorrowIsoDate(now = new Date()): string {
  return getIsoDateOffset(1, now);
}

export function calculateDte(expirationDate: string, now = new Date()): number {
  const expiration = new Date(`${expirationDate}T00:00:00Z`);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  if (Number.isNaN(expiration.getTime())) {
    return Number.NaN;
  }

  return Math.ceil((expiration.getTime() - today.getTime()) / 86_400_000);
}
