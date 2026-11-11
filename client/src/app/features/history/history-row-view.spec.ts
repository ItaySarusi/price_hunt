import { HistoryRow } from '../../core/api.models';
import { formatSearchedAt, toRowView } from './history-row-view';

const row = (patch: Partial<HistoryRow> = {}): HistoryRow => ({
  id: 1,
  searchId: 's1',
  searchedAt: '2026-11-09T12:03:00Z',
  fromDate: '2026-11-20',
  toDate: '2026-11-30',
  from: { code: 'CNSHA', label: 'Shanghai, CN' },
  to: { code: 'USLAX', label: 'Los Angeles, US' },
  supplier: { code: 'A', name: 'Supplier A' },
  status: 'Success',
  price: 1234.56,
  currency: 'USD',
  responseTimeMs: 1830,
  error: null,
  ...patch,
});

describe('toRowView', () => {
  it('formats a successful row', () => {
    expect(toRowView(row())).toMatchObject({
      dates: 'Nov 20 – Nov 30, 2026',
      route: 'Shanghai, CN → Los Angeles, US',
      supplierCode: 'A',
      supplierName: 'Supplier A',
      price: '$1,234.56',
      responseTime: '1.83 s',
      statusLabel: 'OK',
      statusTone: 'success',
      statusTooltip: '',
    });
  });

  it('failed rows show a dash for price and the error as the status tooltip', () => {
    const v = toRowView(row({ status: 'Failed', price: null, error: 'Supplier error 503' }));
    expect(v).toMatchObject({ price: '—', statusLabel: 'Failed', statusTone: 'danger', statusTooltip: 'Supplier error 503' });
  });

  it('no-response rows show "> 6 s" and a warning tag', () => {
    const v = toRowView(row({ status: 'NoResponse', price: null, responseTimeMs: 6000 }));
    expect(v).toMatchObject({ price: '—', responseTime: '> 6 s', statusLabel: 'No response', statusTone: 'warning' });
  });
});

describe('formatSearchedAt', () => {
  it('formats the UTC timestamp in local time as "Searched Nov 9, 2026, 14:03"', () => {
    const local = new Date(2026, 10, 9, 14, 3); // local wall-clock time
    expect(formatSearchedAt(local.toISOString())).toBe('Searched Nov 9, 2026, 14:03');
  });

  it('returns an empty string for missing/invalid input', () => {
    expect(formatSearchedAt('')).toBe('');
    expect(formatSearchedAt('nope')).toBe('');
  });
});
