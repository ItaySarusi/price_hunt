/** API DTOs (SPEC §6.2, §7, §10). Property names are camelCase exactly as sent by the server. */

export interface Location {
  code: string;
  name: string;
  countryCode: string;
  label: string;
}

export interface Supplier {
  code: string;
  name: string;
}

/** Dates are `yyyy-MM-dd` strings built from local parts (see `toIsoDate`). */
export interface SearchRequest {
  fromLocation: string;
  toLocation: string;
  fromDate: string;
  toDate: string;
  suppliers?: string[];
}

export interface StartedEvent {
  searchId: string;
  total: number;
  suppliers: string[];
  timeoutMs: number;
  startedAt: string;
}

export interface QuoteEvent {
  searchId: string;
  supplier: string;
  supplierName: string;
  price: number;
  currency: string;
  responseTimeMs: number;
  receivedAt: string;
}

export interface SupplierFailedEvent {
  searchId: string;
  supplier: string;
  supplierName: string;
  reason: string;
  responseTimeMs: number;
  receivedAt: string;
}

export interface EndEvent {
  searchId: string;
  status: 'Completed' | 'TimedOut';
  total: number;
  responded: number;
  succeeded: number;
  failed: number;
  noResponse: number;
  elapsedMs: number;
}

export type SearchEvent =
  | { type: 'started'; data: StartedEvent }
  | { type: 'quote'; data: QuoteEvent }
  | { type: 'supplier-failed'; data: SupplierFailedEvent }
  | { type: 'end'; data: EndEvent };

export type HistorySortBy = 'date' | 'route' | 'supplier' | 'price' | 'responseTime' | 'status';
export type SortDir = 'asc' | 'desc';
export type HistoryPageSize = 10 | 25 | 50;
export type HistoryStatus = 'Success' | 'Failed' | 'NoResponse';

export interface HistoryQuery {
  start: string;
  end: string;
  suppliers?: string[];
  from?: string;
  to?: string;
  includeFailures?: boolean;
  sortBy?: HistorySortBy;
  sortDir?: SortDir;
  page?: number;
  pageSize?: HistoryPageSize;
}

export interface LocationRef {
  code: string;
  label: string;
}

export interface HistoryRow {
  id: number;
  searchId: string;
  searchedAt: string;
  fromDate: string;
  toDate: string;
  from: LocationRef;
  to: LocationRef;
  supplier: Supplier;
  status: HistoryStatus;
  price: number | null;
  currency: string;
  responseTimeMs: number;
  error: string | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** RFC 7807 problem details as returned by the API on 400. */
export interface ProblemDetails {
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
}
