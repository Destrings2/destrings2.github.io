/** Free time is tracked hourly from 06:00 to midnight: 18 slots. */
export const H0 = 6;
export const HN = 18;

export const HOURS: readonly number[] = Array.from({ length: HN }, (_, i) => H0 + i);

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** 1 January 2024 was a Monday. Week indices count from there. */
const WEEK_EPOCH = Date.UTC(2024, 0, 1);
const WEEK_MS = 7 * 864e5;

/** Monday of the week containing `d`, at local midnight. */
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - dayIndexOf(x));
  return x;
}

/** Monday = 0 … Sunday = 6. */
export function dayIndexOf(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** `YYYY-MM-DD` in local time — never `toISOString`, which shifts the date. */
export function localISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function weekKey(d: Date): string {
  return localISO(mondayOf(d));
}

/** Parse a `YYYY-MM-DD` week key at local midday, clear of any DST boundary. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

/**
 * Weeks since the epoch. Rounded rather than floored because a local Monday
 * midnight drifts by an hour across a DST change.
 */
export function weekIndex(d: Date): number {
  const monday = mondayOf(d);
  const utc = Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate());
  return Math.round((utc - WEEK_EPOCH) / WEEK_MS);
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `90` -> `1h 30m`. */
export function formatMins(m: number): string {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/**
 * Stable string hash. Used to spread chores of the same cadence across
 * different weeks and days rather than piling them all onto week zero.
 */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Preferred day first, then outward — so a job slides rather than failing. */
export function nearDays(d: number): number[] {
  return [0, 1, -1, 2, -2, 3, -3].map((k) => (d + k + 7) % 7);
}
