import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Subject, catchError, concat, map, of, switchMap } from 'rxjs';

import { EndEvent, QuoteEvent, SearchEvent, SearchRequest } from '../../core/api.models';
import { ApiProblemError, SearchStreamService } from '../../core/search-stream.service';

export type SearchStatus = 'idle' | 'running' | 'Completed' | 'TimedOut' | 'Cancelled' | 'ConnectionLost';
export type SupplierState = 'waiting' | 'success' | 'failed' | 'noResponse' | 'cancelled';

export interface SupplierStatus {
  state: SupplierState;
  responseTimeMs?: number;
  reason?: string;
}

/** The search form's value, kept in the store so the form can restore itself after navigation. */
export interface SearchFormValue {
  from: string | null;
  to: string | null;
  start: Date | null;
  end: Date | null;
  /** Selected supplier codes; `null` = never set (the form defaults to all suppliers). */
  suppliers: string[] | null;
}

export interface SearchProblem {
  title: string;
  messages: string[];
}

const EMPTY_FORM: SearchFormValue = { from: null, to: null, start: null, end: null, suppliers: null };

/** Total order: ascending price, then earlier receivedAt, then supplier code (full determinism). */
function compareQuotes(a: QuoteEvent, b: QuoteEvent): number {
  if (a.price !== b.price) return a.price - b.price;
  const ta = Date.parse(a.receivedAt);
  const tb = Date.parse(b.receivedAt);
  if (ta !== tb) return ta - tb;
  return a.supplier < b.supplier ? -1 : a.supplier > b.supplier ? 1 : 0;
}

/**
 * Binary-inserts `quote` into an already sorted list. Returns a NEW array that keeps the same object references
 * for existing items (so `@for ... track q.supplier` reuses DOM). A quote for a supplier already present is
 * ignored (the original list is returned unchanged).
 */
export function insertSorted(list: readonly QuoteEvent[], quote: QuoteEvent): readonly QuoteEvent[] {
  if (list.some((q) => q.supplier === quote.supplier)) return list;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareQuotes(list[mid], quote) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return [...list.slice(0, lo), quote, ...list.slice(lo)];
}

export type Piped =
  | { token: number; kind: 'event'; event: SearchEvent }
  | { token: number; kind: 'closed' }
  | { token: number; kind: 'error'; error: unknown };

/**
 * Root-level search state (SPEC 11.3). Survives route changes, so the form, results and even a running
 * search are kept when the user visits History and comes back.
 *
 * Failure semantics: an ApiProblemError (HTTP 400) returns the status to 'idle' with `problem` set (the page
 * shows an error banner); any other error, or a stream that closes without `end`, is 'ConnectionLost'.
 */
@Injectable({ providedIn: 'root' })
export class SearchStore {
  private readonly streams = inject(SearchStreamService);

  private token = 0;
  private readonly requests = new Subject<{ token: number; req: SearchRequest } | null>();

  private readonly _formValue = signal<SearchFormValue>(EMPTY_FORM);
  private readonly _status = signal<SearchStatus>('idle');
  private readonly _searchId = signal<string | null>(null);
  private readonly _total = signal(0);
  private readonly _timeoutMs = signal(0);
  private readonly _startedAt = signal<number | null>(null);
  private readonly _quotes = signal<readonly QuoteEvent[]>([]);
  private readonly _supplierStates = signal<Readonly<Record<string, SupplierStatus>>>({});
  private readonly _selectedSuppliers = signal<readonly string[]>([]);
  private readonly _problem = signal<SearchProblem | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly formValue = this._formValue.asReadonly();
  readonly status = this._status.asReadonly();
  readonly searchId = this._searchId.asReadonly();
  readonly total = this._total.asReadonly();
  readonly timeoutMs = this._timeoutMs.asReadonly();
  /** Client clock (ms since epoch) when `started` arrived; drives the cosmetic countdown. */
  readonly startedAt = this._startedAt.asReadonly();
  readonly quotes = this._quotes.asReadonly();
  readonly supplierStates = this._supplierStates.asReadonly();
  /** Selected supplier codes in A to G order. */
  readonly selectedSuppliers = this._selectedSuppliers.asReadonly();
  readonly problem = this._problem.asReadonly();
  readonly error = this._error.asReadonly();

  readonly running = computed(() => this._status() === 'running');
  readonly succeeded = computed(() => this.count('success'));
  readonly failed = computed(() => this.count('failed'));
  readonly noResponse = computed(() => this.count('noResponse'));
  readonly cancelled = computed(() => this.count('cancelled'));
  readonly responded = computed(() => this.succeeded() + this.failed());

  constructor() {
    this.requests
      .pipe(
        switchMap((r) => {
          if (!r) return EMPTY;
          const { token } = r;
          return concat(
            this.streams.stream(r.req).pipe(map((event): Piped => ({ token, kind: 'event', event }))),
            of<Piped>({ token, kind: 'closed' }),
          ).pipe(catchError((error: unknown) => of<Piped>({ token, kind: 'error', error })));
        }),
      )
      .subscribe((p) => this.apply(p));
  }

  setFormValue(value: SearchFormValue): void {
    this._formValue.set(value);
  }

  /** Starts a search; any running search is aborted (switchMap) and its state replaced. */
  search(req: SearchRequest): void {
    const token = ++this.token;
    const selected = req.suppliers ? [...new Set(req.suppliers)].sort() : [];
    this._status.set('running');
    this._searchId.set(null);
    this._total.set(selected.length);
    this._timeoutMs.set(0);
    this._startedAt.set(null);
    this._quotes.set([]);
    this._selectedSuppliers.set(selected);
    this._supplierStates.set(Object.fromEntries(selected.map((s) => [s, { state: 'waiting' } as SupplierStatus])));
    this._problem.set(null);
    this._error.set(null);
    this.requests.next({ token, req });
  }

  /** Aborts the running search; late events are dropped. */
  cancel(): void {
    if (this._status() !== 'running') return;
    this.token++;
    this.requests.next(null);
    this._status.set('Cancelled');
    this.markWaiting('cancelled');
  }

  private count(state: SupplierState): number {
    return Object.values(this._supplierStates()).filter((s) => s.state === state).length;
  }

  private markWaiting(state: SupplierState): void {
    this._supplierStates.update((m) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.state === 'waiting' ? { ...v, state } : v])),
    );
  }

  private setSupplier(code: string, status: SupplierStatus): void {
    this._supplierStates.update((m) => ({ ...m, [code]: status }));
  }

  /** @internal exposed for the stale-token unit test; not part of the public API. */
  apply(p: Piped): void {
    if (p.token !== this.token || this._status() !== 'running') return;

    if (p.kind === 'closed') return this.connectionLost();
    if (p.kind === 'error') {
      if (p.error instanceof ApiProblemError) {
        this._problem.set({ title: p.error.title, messages: p.error.messages });
        this._status.set('idle');
        this._supplierStates.set({});
        this._selectedSuppliers.set([]);
        this._total.set(0);
        return;
      }
      this._error.set(p.error instanceof Error ? p.error.message : 'Connection lost');
      return this.connectionLost();
    }

    const e = p.event;
    if (e.type === 'started') {
      if (this._searchId() !== null) return;
      this._searchId.set(e.data.searchId);
      this._total.set(e.data.total);
      this._timeoutMs.set(e.data.timeoutMs);
      this._startedAt.set(Date.now());
      const codes = [...new Set([...this._selectedSuppliers(), ...e.data.suppliers])].sort();
      this._selectedSuppliers.set(codes);
      this._supplierStates.update((m) => {
        const next = { ...m };
        for (const c of codes) next[c] ??= { state: 'waiting' };
        return next;
      });
      return;
    }

    if (e.data.searchId !== this._searchId()) return;

    switch (e.type) {
      case 'quote': {
        const known = this._supplierStates()[e.data.supplier];
        if (!known || known.state === 'success') break; // not selected, or duplicate
        this.setSupplier(e.data.supplier, { state: 'success', responseTimeMs: e.data.responseTimeMs });
        this._quotes.update((list) => insertSorted(list, e.data));
        break;
      }
      case 'supplier-failed':
        this.setSupplier(e.data.supplier, {
          state: 'failed',
          responseTimeMs: e.data.responseTimeMs,
          reason: e.data.reason,
        });
        break;
      case 'end':
        this.finish(e.data);
        break;
    }
  }

  private finish(end: EndEvent): void {
    this._total.set(end.total);
    this._status.set(end.status);
    if (end.status === 'TimedOut') this.markWaiting('noResponse');
  }

  private connectionLost(): void {
    this._status.set('ConnectionLost');
    this.markWaiting('cancelled');
  }
}
