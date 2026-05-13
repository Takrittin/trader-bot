export function getTomorrowIsoDate(now = new Date()): string {
  const nextDate = new Date(now);

  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  return nextDate.toISOString().slice(0, 10);
}
