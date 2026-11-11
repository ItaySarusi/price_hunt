/**
 * Pure display formatters (SPEC §11.1 "Formatting"). The pipes in this folder are thin wrappers around these.
 * Date-only strings (`yyyy-MM-dd`) are parsed as LOCAL dates — never via `new Date('yyyy-MM-dd')`, which is UTC
 * and shifts the day in time zones west of Greenwich.
 */
export type DateInput = string | Date | null | undefined;

const EMPTY = '—';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const priceFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Returns a local-midnight Date for a `yyyy-MM-dd` (or ISO date-time) string or Date; null when missing/invalid. */
export function toLocalDate(value: DateInput): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (!value) return null;
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d);
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d ? date : null;
}

/** `$1,234.56` (en-US, USD). */
export function formatPrice(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? EMPTY : priceFormat.format(value);
}

const monthDay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const full = (d: Date) => `${monthDay(d)}, ${d.getFullYear()}`;

/** `Nov 9, 2026`. */
export function formatDate(value: DateInput): string {
  const d = toLocalDate(value);
  return d ? full(d) : EMPTY;
}

/** `Nov 20 – Nov 30, 2026` (same year) · `Dec 28, 2026 – Jan 3, 2027` (across years) · `Nov 20, 2026` (same day). */
export function formatDateRange(start: DateInput, end: DateInput): string {
  const a = toLocalDate(start);
  const b = toLocalDate(end);
  if (!a || !b) return a ? full(a) : b ? full(b) : EMPTY;
  if (a.getTime() === b.getTime()) return full(a);
  return a.getFullYear() === b.getFullYear() ? `${monthDay(a)} – ${full(b)}` : `${full(a)} – ${full(b)}`;
}

/** Milliseconds → `1.83 s` (two decimals, half-up on the hundredths). */
export function formatResponseMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return EMPTY;
  return `${(Math.round(ms / 10) / 100).toFixed(2)} s`;
}

/** `yyyy-MM-dd` from the LOCAL date parts. Never `toISOString()` — it shifts the day in UTC+ zones (SPEC §11.3). */
export function toIsoDate(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Remaining ms → `4.2 s left` (one decimal, rounded UP to the next tenth so it never shows 0.0 early; clamps at 0). */
export function formatCountdown(remainingMs: number): string {
  const tenths = Math.max(0, Math.ceil(remainingMs / 100));
  return `${(tenths / 10).toFixed(1)} s left`;
}

export interface SearchSummaryCounts {
  succeeded: number;
  failed: number;
  noResponse: number;
  cancelled: number;
}

/** `4 prices · 1 failed · 2 no response` (+ ` · 3 cancelled` only when some suppliers were cancelled). */
export function formatSearchSummary(c: SearchSummaryCounts): string {
  const parts = [`${c.succeeded} ${c.succeeded === 1 ? 'price' : 'prices'}`, `${c.failed} failed`, `${c.noResponse} no response`];
  if (c.cancelled > 0) parts.push(`${c.cancelled} cancelled`);
  return parts.join(' · ');
}
