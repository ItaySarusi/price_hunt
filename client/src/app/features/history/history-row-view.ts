import { HistoryRow, HistoryStatus } from '../../core/api.models';
import { formatDateRange, formatPrice, formatResponseMs } from '../../shared/format';

export type StatusTone = 'success' | 'danger' | 'warning';

/** Display-ready History row (SPEC §11.4 table columns) — computed once per row, not per change detection. */
export interface HistoryRowView {
  id: string;
  dates: string;
  searched: string;
  route: string;
  fromLabel: string;
  toLabel: string;
  supplierCode: string;
  supplierName: string;
  price: string;
  responseTime: string;
  statusLabel: string;
  statusTone: StatusTone;
  statusTooltip: string;
}

const STATUS: Record<HistoryStatus, { label: string; tone: StatusTone }> = {
  Success: { label: 'OK', tone: 'success' },
  Failed: { label: 'Failed', tone: 'danger' },
  NoResponse: { label: 'No response', tone: 'warning' },
};

export function toRowView(r: HistoryRow): HistoryRowView {
  const status = STATUS[r.status] ?? STATUS.Failed;
  return {
    id: String(r.id),
    dates: formatDateRange(r.fromDate, r.toDate),
    searched: formatSearchedAt(r.searchedAt),
    route: `${r.from.label} → ${r.to.label}`,
    fromLabel: r.from.label,
    toLabel: r.to.label,
    supplierCode: r.supplier.code,
    supplierName: r.supplier.name,
    price: formatPrice(r.price),
    responseTime: r.status === 'NoResponse' ? '> 6 s' : formatResponseMs(r.responseTimeMs),
    statusLabel: status.label,
    statusTone: status.tone,
    statusTooltip: r.status === 'Failed' ? (r.error ?? '') : '',
  };
}

const searchedFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * `searchedAt` is a UTC ISO timestamp → "Searched Nov 9, 2026, 14:03" in the viewer's LOCAL time.
 * (Not via `toLocalDate`, which deliberately drops the time part.)
 */
export function formatSearchedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `Searched ${searchedFormat.format(d)}`;
}
