import { ParamMap, Params } from '@angular/router';

import { HistoryPageSize, HistoryQuery, HistorySortBy, SortDir } from '../../core/api.models';
import { toIsoDate, toLocalDate } from '../../shared/format';

/**
 * History screen state ⇄ URL query params (SPEC §11.4 "URL sync"). Pure functions, no Angular DI.
 * `?start=…&end=…&suppliers=A,B&from=…&to=…&failures=1&sort=date&dir=asc&page=1&size=25`, defaults omitted.
 * Invalid params silently fall back to their defaults so a hand-edited URL never breaks the page.
 */
export interface HistoryFilters {
  /** `yyyy-MM-dd` (local). */
  start: string;
  end: string;
  /** Selected supplier codes, always in A→G order. */
  suppliers: string[];
  from: string | null;
  to: string | null;
  failures: boolean;
  sort: HistorySortBy;
  dir: SortDir;
  page: number;
  size: HistoryPageSize;
}

export const ALL_SUPPLIERS: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
export const SORT_COLUMNS: readonly HistorySortBy[] = ['date', 'route', 'supplier', 'price', 'responseTime', 'status'];
export const PAGE_SIZES: readonly HistoryPageSize[] = [10, 25, 50];
const DEFAULT_RANGE_DAYS = 30;
const LOCATION_CODE = /^[A-Z0-9]{5}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function defaultFilters(today: Date): HistoryFilters {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DEFAULT_RANGE_DAYS);
  return {
    start: toIsoDate(today),
    end: toIsoDate(end),
    suppliers: [...ALL_SUPPLIERS],
    from: null,
    to: null,
    failures: true,
    sort: 'date',
    dir: 'asc',
    page: 1,
    size: 25,
  };
}

/** A→G order, unknown codes and duplicates dropped. */
export function normaliseSuppliers(codes: readonly string[]): string[] {
  return ALL_SUPPLIERS.filter((c) => codes.includes(c));
}

const isAll = (codes: readonly string[]) => normaliseSuppliers(codes).length === ALL_SUPPLIERS.length;

export function filtersFromParams(params: ParamMap | Params, today: Date): HistoryFilters {
  const get = (key: string): string | null => {
    if (isParamMap(params)) return params.get(key);
    const v = params[key];
    return v == null ? null : String(Array.isArray(v) ? v[0] : v);
  };
  const d = defaultFilters(today);

  let start = isoDay(get('start')) ?? d.start;
  let end = isoDay(get('end')) ?? d.end;
  if (start > end) [start, end] = [d.start, d.end];

  const supplierList = normaliseSuppliers((get('suppliers') ?? '').split(',').map((s) => s.trim().toUpperCase()));
  const page = Number(get('page'));
  const size = Number(get('size'));
  const failures = get('failures');
  const sort = get('sort') as HistorySortBy | null;
  const dir = get('dir');

  return {
    start,
    end,
    suppliers: supplierList.length ? supplierList : d.suppliers,
    from: locationCode(get('from')),
    to: locationCode(get('to')),
    failures: failures === '0' ? false : failures === '1' ? true : d.failures,
    sort: sort && SORT_COLUMNS.includes(sort) ? sort : d.sort,
    dir: dir === 'asc' || dir === 'desc' ? dir : d.dir,
    page: Number.isInteger(page) && page >= 1 ? page : d.page,
    size: PAGE_SIZES.includes(size as HistoryPageSize) ? (size as HistoryPageSize) : d.size,
  };
}

/** Query params for `router.navigate([], { queryParams })` — only the values that differ from the defaults. */
export function paramsFromFilters(f: HistoryFilters, today: Date): Params {
  const d = defaultFilters(today);
  const p: Params = {};
  if (f.start !== d.start) p['start'] = f.start;
  if (f.end !== d.end) p['end'] = f.end;
  if (!isAll(f.suppliers)) p['suppliers'] = normaliseSuppliers(f.suppliers).join(',');
  if (f.from) p['from'] = f.from;
  if (f.to) p['to'] = f.to;
  if (f.failures !== d.failures) p['failures'] = f.failures ? '1' : '0';
  if (f.sort !== d.sort) p['sort'] = f.sort;
  if (f.dir !== d.dir) p['dir'] = f.dir;
  if (f.page !== d.page) p['page'] = String(f.page);
  if (f.size !== d.size) p['size'] = String(f.size);
  return p;
}

/** Filters → `GET /api/history` query (SPEC §10). All suppliers selected → no supplier filter at all. */
export function toHistoryQuery(f: HistoryFilters): HistoryQuery {
  return {
    start: f.start,
    end: f.end,
    suppliers: isAll(f.suppliers) ? undefined : normaliseSuppliers(f.suppliers),
    from: f.from ?? undefined,
    to: f.to ?? undefined,
    includeFailures: f.failures,
    sortBy: f.sort,
    sortDir: f.dir,
    page: f.page,
    pageSize: f.size,
  };
}

/** Supplier select trigger: "All suppliers" · "Supplier A, C (+2)" (first two letters, then the overflow count). */
export function supplierSummary(selected: readonly string[], all: readonly string[]): string {
  const codes = all.filter((c) => selected.includes(c));
  if (codes.length === 0) return 'No suppliers';
  if (codes.length === all.length) return 'All suppliers';
  const shown = `Supplier ${codes.slice(0, 2).join(', ')}`;
  return codes.length > 2 ? `${shown} (+${codes.length - 2})` : shown;
}

function isParamMap(p: ParamMap | Params): p is ParamMap {
  return typeof (p as ParamMap).get === 'function' && typeof (p as ParamMap).keys !== 'undefined';
}

function isoDay(v: string | null): string | null {
  if (!v || !ISO_DAY.test(v)) return null;
  const d = toLocalDate(v);
  return d ? toIsoDate(d) : null;
}

function locationCode(v: string | null): string | null {
  const code = v?.trim().toUpperCase() ?? '';
  return LOCATION_CODE.test(code) ? code : null;
}
