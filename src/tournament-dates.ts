const PACIFIC_DATE_KEY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pacificDateKey(date = new Date()): string {
  const parts = Object.fromEntries(
    PACIFIC_DATE_KEY.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentOrFutureTournaments<T extends { endDate: string }>(
  tournaments: T[],
  today = pacificDateKey(),
): T[] {
  return tournaments.filter((tournament) => tournament.endDate >= today);
}

/** Calendar days in Pacific time, independent of time of day and DST. */
export function pacificDaysUntil(date: string, now = new Date()): number {
  return Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${pacificDateKey(now)}T00:00:00Z`)) / 86_400_000));
}
