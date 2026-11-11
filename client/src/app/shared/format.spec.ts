import {
  formatCountdown,
  formatDate,
  formatDateRange,
  formatPrice,
  formatResponseMs,
  formatSearchSummary,
  toLocalDate,
} from './format';

describe('formatPrice', () => {
  it('formats en-US USD with thousands separator and cents', () => {
    expect(formatPrice(1234.56)).toBe('$1,234.56');
  });
  it('pads cents', () => {
    expect(formatPrice(980)).toBe('$980.00');
    expect(formatPrice(0)).toBe('$0.00');
  });
  it('rounds to two decimals', () => {
    expect(formatPrice(1234.567)).toBe('$1,234.57');
  });
  it('returns an em dash for null/undefined', () => {
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(undefined)).toBe('—');
  });
});

describe('toLocalDate', () => {
  it('parses yyyy-MM-dd as a LOCAL date (no UTC shift)', () => {
    const d = toLocalDate('2026-11-09')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
  });
  it('accepts an ISO date-time string by taking its date part', () => {
    const d = toLocalDate('2026-01-03T00:00:00')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 3]);
  });
  it('passes Date objects through as a copy of the local date', () => {
    const src = new Date(2026, 0, 3, 15, 30);
    const d = toLocalDate(src)!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 3]);
  });
  it('returns null for empty or invalid input', () => {
    expect(toLocalDate(null)).toBeNull();
    expect(toLocalDate('')).toBeNull();
    expect(toLocalDate('not-a-date')).toBeNull();
    expect(toLocalDate(new Date(NaN))).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats MMM d, y', () => {
    expect(formatDate('2026-11-09')).toBe('Nov 9, 2026');
    expect(formatDate(new Date(2027, 0, 3))).toBe('Jan 3, 2027');
  });
  it('does not shift a day for date-only strings', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });
  it('returns an em dash for missing input', () => {
    expect(formatDate(null)).toBe('—');
  });
});

describe('formatDateRange', () => {
  it('collapses the year when both dates share it', () => {
    expect(formatDateRange('2026-11-20', '2026-11-30')).toBe('Nov 20 – Nov 30, 2026');
  });
  it('shows both years across a year boundary', () => {
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
  it('shows a single date when start and end are the same day', () => {
    expect(formatDateRange('2026-11-20', '2026-11-20')).toBe('Nov 20, 2026');
    expect(formatDateRange(new Date(2026, 10, 20, 8), new Date(2026, 10, 20, 22))).toBe('Nov 20, 2026');
  });
  it('accepts Date objects', () => {
    expect(formatDateRange(new Date(2026, 10, 20), new Date(2026, 11, 2))).toBe('Nov 20 – Dec 2, 2026');
  });
  it('falls back gracefully when one side is missing', () => {
    expect(formatDateRange('2026-11-20', null)).toBe('Nov 20, 2026');
    expect(formatDateRange(null, '2026-11-30')).toBe('Nov 30, 2026');
    expect(formatDateRange(null, null)).toBe('—');
  });
});

describe('formatResponseMs', () => {
  it('formats milliseconds as seconds with two decimals', () => {
    expect(formatResponseMs(1830)).toBe('1.83 s');
    expect(formatResponseMs(1834)).toBe('1.83 s');
    expect(formatResponseMs(1835.5)).toBe('1.84 s');
    expect(formatResponseMs(0)).toBe('0.00 s');
    expect(formatResponseMs(12000)).toBe('12.00 s');
  });
  it('returns an em dash for null/undefined', () => {
    expect(formatResponseMs(null)).toBe('—');
  });
});

describe('formatCountdown', () => {
  it('shows the remaining time with one decimal, rounded up to the next tenth', () => {
    expect(formatCountdown(4200)).toBe('4.2 s left');
    expect(formatCountdown(4201)).toBe('4.3 s left');
    expect(formatCountdown(6000)).toBe('6.0 s left');
    expect(formatCountdown(50)).toBe('0.1 s left');
  });
  it('clamps at 0.0', () => {
    expect(formatCountdown(0)).toBe('0.0 s left');
    expect(formatCountdown(-350)).toBe('0.0 s left');
  });
});

describe('formatSearchSummary', () => {
  it('matches the spec example', () => {
    expect(formatSearchSummary({ succeeded: 4, failed: 1, noResponse: 2, cancelled: 0 })).toBe(
      '4 prices · 1 failed · 2 no response',
    );
  });
  it('pluralizes "price" and keeps zero parts', () => {
    expect(formatSearchSummary({ succeeded: 1, failed: 0, noResponse: 0, cancelled: 0 })).toBe(
      '1 price · 0 failed · 0 no response',
    );
    expect(formatSearchSummary({ succeeded: 0, failed: 7, noResponse: 0, cancelled: 0 })).toBe(
      '0 prices · 7 failed · 0 no response',
    );
  });
  it('appends the cancelled count only when some suppliers were cancelled', () => {
    expect(formatSearchSummary({ succeeded: 2, failed: 1, noResponse: 0, cancelled: 4 })).toBe(
      '2 prices · 1 failed · 0 no response · 4 cancelled',
    );
  });
});
