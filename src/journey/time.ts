/** Minutes past midnight → `HH:MM`, wrapping past a day boundary. */
export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
}

/** Minutes → `2h05`. */
export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** `HH:MM`, or the same without the colon, → minutes past midnight, or null if unparseable. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * GTFS counts seconds from midnight and lets them run past a day; the app counts minutes and does
 * the same, so this is a plain divide and no wrapping.
 */
export const toMinutes = (seconds: number): number => Math.round(seconds / 60);

export const toSeconds = (minutes: number): number => minutes * 60;

/** `YYYY-MM-DD` → a Date at midnight UTC, or null. Dates from the feed carry no time of day. */
export function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A Date → the `YYYYMMDD` number a GTFS feed writes its dates as. */
export const toDateNumber = (date: Date): number =>
  date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

/** The `YYYYMMDD` number a GTFS feed writes → `YYYY-MM-DD`. */
export const fromDateNumber = (date: number): string =>
  `${Math.floor(date / 10000)}-${String(Math.floor(date / 100) % 100).padStart(2, '0')}-${String(date % 100).padStart(2, '0')}`;
