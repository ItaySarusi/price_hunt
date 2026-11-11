import { DateRangePipe, PricePipe, ResponseTimePipe, ShortDatePipe } from './format.pipes';

describe('formatter pipes', () => {
  it('delegate to the pure formatters', () => {
    expect(new PricePipe().transform(1234.56)).toBe('$1,234.56');
    expect(new ShortDatePipe().transform('2026-11-09')).toBe('Nov 9, 2026');
    expect(new DateRangePipe().transform('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
    expect(new ResponseTimePipe().transform(1830)).toBe('1.83 s');
  });
});
