import { toIsoDate, toLocalDate } from './format';

declare const process: { env: { TZ?: string } };

// Run in a UTC+ zone, where `toISOString()` shifts a just-after-midnight local date to the previous day.
// Node honours runtime changes of process.env.TZ; the first test asserts the zone is really in effect.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Jerusalem';
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('toIsoDate', () => {
  it('runs in a UTC+ zone (guard for the regression test below)', () => {
    expect(new Date(2026, 10, 9, 0, 30).toISOString().slice(0, 10)).toBe('2026-11-08');
  });

  it('uses local parts, not UTC (just after local midnight, UTC+)', () => {
    expect(toIsoDate(new Date(2026, 10, 9, 0, 30))).toBe('2026-11-09');
  });

  it('keeps the day just before local midnight', () => {
    expect(toIsoDate(new Date(2026, 10, 9, 23, 59, 59))).toBe('2026-11-09');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it('handles year boundaries and leap days', () => {
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(toIsoDate(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01');
    expect(toIsoDate(new Date(2028, 1, 29))).toBe('2028-02-29');
  });

  it('pads years below 1000 to four digits', () => {
    const d = new Date(2000, 0, 1);
    d.setFullYear(999);
    expect(toIsoDate(d)).toBe('0999-01-01');
  });

  it('round-trips with toLocalDate', () => {
    expect(toIsoDate(toLocalDate('2026-11-09')!)).toBe('2026-11-09');
  });
});
