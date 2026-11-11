import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';

import { EndEvent, QuoteEvent, SearchEvent, SearchRequest } from '../../core/api.models';
import { ApiProblemError, SearchStreamService } from '../../core/search-stream.service';
import { SearchStore, insertSorted } from './search.store';

const REQ: SearchRequest = {
  fromLocation: 'CNSHA', toLocation: 'USLAX', fromDate: '2026-11-20', toDate: '2026-11-30',
  suppliers: ['A', 'B', 'C'],
};

const q = (supplier: string, price: number, receivedAt = '2026-11-09T10:00:01.000Z', searchId = 's1'): QuoteEvent => ({
  searchId, supplier, supplierName: `Supplier ${supplier}`, price, currency: 'USD', responseTimeMs: 900, receivedAt,
});
const quoteEv = (...a: Parameters<typeof q>): SearchEvent => ({ type: 'quote', data: q(...a) });
const startedEv = (searchId = 's1', suppliers = ['A', 'B', 'C']): SearchEvent => ({
  type: 'started',
  data: { searchId, total: suppliers.length, suppliers, timeoutMs: 6000, startedAt: '2026-11-09T10:00:00Z' },
});
const failedEv = (supplier: string, searchId = 's1'): SearchEvent => ({
  type: 'supplier-failed',
  data: { searchId, supplier, supplierName: `Supplier ${supplier}`, reason: 'boom', responseTimeMs: 500, receivedAt: '2026-11-09T10:00:02Z' },
});
const endEv = (status: EndEvent['status'], searchId = 's1'): SearchEvent => ({
  type: 'end',
  data: { searchId, status, total: 3, responded: 2, succeeded: 1, failed: 1, noResponse: 1, elapsedMs: 6000 },
});

describe('insertSorted', () => {
  it('orders by ascending price', () => {
    let l: readonly QuoteEvent[] = [];
    for (const [s, p] of [['A', 300], ['B', 100], ['C', 200]] as const) l = insertSorted(l, q(s, p));
    expect(l.map((x) => x.supplier)).toEqual(['B', 'C', 'A']);
  });

  it('breaks price ties by earlier receivedAt, then supplier code', () => {
    let l: readonly QuoteEvent[] = [];
    l = insertSorted(l, q('A', 100, '2026-11-09T10:00:05Z'));
    l = insertSorted(l, q('B', 100, '2026-11-09T10:00:02Z'));
    l = insertSorted(l, q('D', 100, '2026-11-09T10:00:09Z'));
    l = insertSorted(l, q('C', 100, '2026-11-09T10:00:02Z'));
    expect(l.map((x) => x.supplier)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('ignores a second quote for the same supplier', () => {
    const l = insertSorted([q('A', 100)], q('A', 50));
    expect(l.length).toBe(1);
    expect(l[0].price).toBe(100);
  });

  it('returns a new array but keeps existing object references', () => {
    const a = q('A', 100);
    const b = q('B', 300);
    const l1 = [a, b];
    const l2 = insertSorted(l1, q('C', 200));
    expect(l2).not.toBe(l1);
    expect(l2[0]).toBe(a);
    expect(l2[2]).toBe(b);
    expect(l1.length).toBe(2);
  });

  it('a large random sequence equals a full sort', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const all: QuoteEvent[] = [];
    let l: readonly QuoteEvent[] = [];
    for (let i = 0; i < 500; i++) {
      const item = q(`S${i}`, Math.floor(rnd() * 50), new Date(Date.UTC(2026, 10, 9, 10, 0, Math.floor(rnd() * 20))).toISOString());
      all.push(item);
      l = insertSorted(l, item);
    }
    const expected = [...all].sort(
      (x, y) => x.price - y.price || Date.parse(x.receivedAt) - Date.parse(y.receivedAt) || (x.supplier < y.supplier ? -1 : 1),
    );
    expect(l).toEqual(expected);
  });
});

describe('SearchStore', () => {
  let store: SearchStore;
  let subjects: Subject<SearchEvent>[];
  let unsubscribed: boolean[];

  beforeEach(() => {
    subjects = [];
    unsubscribed = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SearchStreamService,
          useValue: {
            stream: (): Observable<SearchEvent> =>
              new Observable<SearchEvent>((sub) => {
                const s = new Subject<SearchEvent>();
                const i = subjects.push(s) - 1;
                unsubscribed[i] = false;
                const inner = s.subscribe(sub);
                return () => {
                  unsubscribed[i] = true;
                  inner.unsubscribe();
                };
              }),
          },
        },
      ],
    });
    store = TestBed.inject(SearchStore);
  });

  const emit = (ev: SearchEvent, i = subjects.length - 1) => subjects[i].next(ev);

  it('starts idle', () => {
    expect(store.status()).toBe('idle');
    expect(store.quotes()).toEqual([]);
  });

  it('search() sets running with all selected suppliers waiting', () => {
    store.search(REQ);
    expect(store.status()).toBe('running');
    expect(store.selectedSuppliers()).toEqual(['A', 'B', 'C']);
    expect(Object.values(store.supplierStates()).every((s) => s.state === 'waiting')).toBe(true);
  });

  it('applies started, quotes in sorted order, and counters', () => {
    store.search(REQ);
    emit(startedEv());
    expect(store.searchId()).toBe('s1');
    expect(store.total()).toBe(3);
    expect(store.timeoutMs()).toBe(6000);
    expect(store.startedAt()).not.toBeNull();
    emit(quoteEv('A', 300));
    emit(quoteEv('B', 100));
    expect(store.quotes().map((x) => x.supplier)).toEqual(['B', 'A']);
    expect(store.supplierStates()['B']).toEqual({ state: 'success', responseTimeMs: 900 });
    expect(store.responded()).toBe(2);
    expect(store.succeeded()).toBe(2);
  });

  it('supplier-failed updates state but adds no quote', () => {
    store.search(REQ);
    emit(startedEv());
    emit(failedEv('C'));
    expect(store.quotes()).toEqual([]);
    expect(store.supplierStates()['C']).toEqual({ state: 'failed', responseTimeMs: 500, reason: 'boom' });
    expect(store.failed()).toBe(1);
    expect(store.responded()).toBe(1);
  });

  it('end Completed sets status', () => {
    store.search(REQ);
    emit(startedEv());
    emit(quoteEv('A', 1));
    emit(endEv('Completed'));
    expect(store.status()).toBe('Completed');
  });

  it('end TimedOut marks waiting suppliers noResponse', () => {
    store.search(REQ);
    emit(startedEv());
    emit(quoteEv('A', 1));
    emit(failedEv('B'));
    emit(endEv('TimedOut'));
    expect(store.status()).toBe('TimedOut');
    expect(store.supplierStates()['C'].state).toBe('noResponse');
    expect(store.noResponse()).toBe(1);
    expect(store.supplierStates()['A'].state).toBe('success');
  });

  it('the stream completing after end keeps the end status', () => {
    store.search(REQ);
    emit(startedEv());
    emit(endEv('Completed'));
    subjects[0].complete();
    expect(store.status()).toBe('Completed');
  });

  it('ignores events whose searchId does not match', () => {
    store.search(REQ);
    emit(startedEv('s1'));
    emit(quoteEv('A', 10, undefined, 'other'));
    emit(failedEv('B', 'other'));
    emit(endEv('Completed', 'other'));
    expect(store.quotes()).toEqual([]);
    expect(store.status()).toBe('running');
  });

  it('ignores a second started event', () => {
    store.search(REQ);
    emit(startedEv('s1'));
    emit(startedEv('s2'));
    expect(store.searchId()).toBe('s1');
  });

  it('ignores quotes before started (no searchId yet)', () => {
    store.search(REQ);
    emit(quoteEv('A', 10));
    expect(store.quotes()).toEqual([]);
  });

  it('cancel() sets Cancelled, waiting to cancelled, aborts the stream, and drops late events', () => {
    store.search(REQ);
    emit(startedEv());
    emit(quoteEv('A', 10));
    store.cancel();
    expect(store.status()).toBe('Cancelled');
    expect(unsubscribed[0]).toBe(true);
    expect(store.supplierStates()['A'].state).toBe('success');
    expect(store.supplierStates()['B'].state).toBe('cancelled');
    emit(quoteEv('B', 5));
    emit(endEv('Completed'));
    expect(store.quotes().length).toBe(1);
    expect(store.status()).toBe('Cancelled');
  });

  it('cancel() when not running is a no-op', () => {
    store.cancel();
    expect(store.status()).toBe('idle');
  });

  it('a new search resets state and aborts the previous one', () => {
    store.search(REQ);
    emit(startedEv('s1'));
    emit(quoteEv('A', 10));
    store.search({ ...REQ, suppliers: ['D', 'E'] });
    expect(unsubscribed[0]).toBe(true);
    expect(store.quotes()).toEqual([]);
    expect(store.searchId()).toBeNull();
    expect(store.status()).toBe('running');
    expect(store.selectedSuppliers()).toEqual(['D', 'E']);
    emit(quoteEv('A', 1), 0); // late event from the old stream
    expect(store.quotes()).toEqual([]);
    emit(startedEv('s2', ['D', 'E']));
    emit(quoteEv('D', 20, undefined, 's2'));
    expect(store.quotes().map((x) => x.supplier)).toEqual(['D']);
  });

  it('stream completing without end becomes ConnectionLost', () => {
    store.search(REQ);
    emit(startedEv());
    emit(quoteEv('A', 10));
    subjects[0].complete();
    expect(store.status()).toBe('ConnectionLost');
    expect(store.quotes().length).toBe(1);
  });

  it('network error becomes ConnectionLost with the error message', () => {
    store.search(REQ);
    emit(startedEv());
    subjects[0].error(new Error('network down'));
    expect(store.status()).toBe('ConnectionLost');
    expect(store.error()).toBe('network down');
  });

  it('ApiProblemError returns to idle and exposes the problem messages', () => {
    store.search(REQ);
    subjects[0].error(new ApiProblemError(400, 'Validation failed', ['Dates in the past']));
    expect(store.status()).toBe('idle');
    expect(store.problem()).toEqual({ title: 'Validation failed', messages: ['Dates in the past'] });
  });

  it('starting a new search clears the previous problem and the pipeline survives the error', () => {
    store.search(REQ);
    subjects[0].error(new ApiProblemError(400, 'x', ['m']));
    store.search(REQ);
    expect(store.problem()).toBeNull();
    expect(subjects.length).toBe(2);
    emit(startedEv('s2'));
    emit(quoteEv('A', 5, undefined, 's2'));
    expect(store.searchId()).toBe('s2');
    expect(store.quotes().map((x) => x.supplier)).toEqual(['A']);
  });

  it('drops pipeline items carrying an old client token', () => {
    store.search(REQ);
    emit(startedEv('s1'));
    store.search(REQ); // token 2
    emit(startedEv('s2'));
    store.apply({ token: 1, kind: 'event', event: quoteEv('A', 1, undefined, 's2') });
    store.apply({ token: 1, kind: 'event', event: endEv('Completed', 's2') });
    store.apply({ token: 1, kind: 'closed' });
    expect(store.quotes()).toEqual([]);
    expect(store.status()).toBe('running');
    store.apply({ token: 2, kind: 'event', event: quoteEv('A', 1, undefined, 's2') });
    expect(store.quotes().length).toBe(1);
  });

  it('ignores duplicate quotes (chip keeps first response time) and quotes from unselected suppliers', () => {
    store.search(REQ);
    emit(startedEv());
    emit(quoteEv('A', 100));
    emit({ type: 'quote', data: { ...q('A', 50), responseTimeMs: 111 } });
    emit(quoteEv('Z', 10));
    expect(store.quotes().map((x) => x.supplier)).toEqual(['A']);
    expect(store.supplierStates()['A'].responseTimeMs).toBe(900);
    expect(store.supplierStates()['Z']).toBeUndefined();
  });

  it('keeps the form value', () => {
    const v = { from: 'CNSHA', to: 'USLAX', start: new Date(2026, 10, 20), end: new Date(2026, 10, 30), suppliers: ['A'] };
    store.setFormValue(v);
    expect(store.formValue()).toEqual(v);
  });
});
