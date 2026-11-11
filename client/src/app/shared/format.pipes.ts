import { Pipe, PipeTransform } from '@angular/core';
import { DateInput, formatDate, formatDateRange, formatPrice, formatResponseMs } from './format';

/** `{{ 1234.56 | phPrice }}` → `$1,234.56` */
@Pipe({ name: 'phPrice' })
export class PricePipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatPrice(value);
  }
}

/** `{{ '2026-11-09' | phDate }}` → `Nov 9, 2026` */
@Pipe({ name: 'phDate' })
export class ShortDatePipe implements PipeTransform {
  transform(value: DateInput): string {
    return formatDate(value);
  }
}

/** `{{ start | phDateRange: end }}` → `Nov 20 – Nov 30, 2026` */
@Pipe({ name: 'phDateRange' })
export class DateRangePipe implements PipeTransform {
  transform(start: DateInput, end: DateInput): string {
    return formatDateRange(start, end);
  }
}

/** `{{ 1830 | phSeconds }}` → `1.83 s` */
@Pipe({ name: 'phSeconds' })
export class ResponseTimePipe implements PipeTransform {
  transform(ms: number | null | undefined): string {
    return formatResponseMs(ms);
  }
}
