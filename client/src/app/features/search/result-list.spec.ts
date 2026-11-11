import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { EndEvent, SearchEvent, SearchRequest } from '../../core/api.models';
import { SearchStreamService } from '../../core/search-stream.service';
import { ResultList } from './result-list';
import { SearchStore } from './search.store';

const REQ: SearchRequest = {
  fromLocation: 'CNSHA', toLocation: 'USLAX', fromDate: '2026-11-20', toDate: '2026-11-30',
  suppliers: ['A', 'B', 'C', 'D', 'E'],
};

const started = (): SearchEvent => ({
  type: 'started',
  data: { searchId: 's1', total: 5, suppliers: REQ.suppliers!, timeoutMs: 6000, startedAt: '2026-11-09T10:00:00Z' },
});
const quote = (supplier: string, price: number, responseTimeMs = 1830): SearchEvent => ({
  type: 'quote',
  data: {
    searchId: 's1', supplier, supplierName: `Supplier ${supplier}`, price, currency: 'USD', responseTimeMs,
    receivedAt: '2026-11-09T10:00:02Z',
  },
});
const end = (status: EndEvent['status'] = 'Completed'): SearchEvent => ({
  type: 'end',
  data: { searchId: 's1', status, total: 5, responded: 5, succeeded: 0, failed: 5, noResponse: 0, elapsedMs: 3000 },
});

describe('ResultList', () => {
  let fixture: ComponentFixture<ResultList>;
  let store: SearchStore;
  let events: Subject<SearchEvent>;
  let el: HTMLElement;

  const cards = () => Array.from(el.querySelectorAll<HTMLElement>('[data-testid="result-card"]'));
  const card = (s: string) => el.querySelector<HTMLElement>(`[data-testid="result-card"][data-supplier="${s}"]`)!;
  const text = (e: Element | null) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const emit = async (...evs: SearchEvent[]) => {
    for (const e of evs) events.next(e);
    await render();
  };

  beforeEach(async () => {
    events = new Subject<SearchEvent>();
    TestBed.configureTestingModule({
      imports: [ResultList],
      providers: [{ provide: SearchStreamService, useValue: { stream: () => events } }],
    });
    store = TestBed.inject(SearchStore);
    fixture = TestBed.createComponent(ResultList);
    el = fixture.nativeElement;
    await render();
  });

  it('shows the empty state before the first search', () => {
    expect(text(el)).toContain('Pick a route and dates to compare up to 7 suppliers.');
    expect(cards().length).toBe(0);
  });

  it('shows 3 skeleton cards while running with no quotes (and no result-card hooks on them)', async () => {
    store.search(REQ);
    await emit(started());
    expect(el.querySelectorAll('[data-testid="result-skeleton"]').length).toBe(3);
    expect(cards().length).toBe(0);
    expect(text(el)).not.toContain('Pick a route');
  });

  it('renders quotes in ascending price order whatever the arrival order, with data-price hooks', async () => {
    store.search(REQ);
    await emit(started(), quote('C', 1500));
    await emit(quote('A', 900));
    await emit(quote('E', 2100));
    await emit(quote('B', 1200));

    expect(cards().map((c) => c.dataset['supplier'])).toEqual(['A', 'B', 'C', 'E']);
    expect(cards().map((c) => Number(c.dataset['price']))).toEqual([900, 1200, 1500, 2100]);
    expect(el.querySelectorAll('[data-testid="result-skeleton"]').length).toBe(0);
  });

  it('renders rank, supplier name, response time and formatted price', async () => {
    store.search(REQ);
    await emit(started(), quote('B', 1234.5, 1830), quote('A', 999, 2410));
    expect(text(card('A'))).toContain('#1');
    expect(text(card('A'))).toContain('Supplier A');
    expect(text(card('A'))).toContain('2.41 s');
    expect(text(card('A'))).toContain('$999.00');
    expect(text(card('B'))).toContain('#2');
    expect(text(card('B'))).toContain('$1,234.50');
  });

  it('reuses the same DOM element for a supplier when the list re-orders', async () => {
    store.search(REQ);
    await emit(started(), quote('C', 1500));
    const c = card('C');
    await emit(quote('A', 900));
    await emit(quote('B', 1000));
    expect(card('C')).toBe(c);
    expect(text(c)).toContain('#3');
  });

  it('puts the Cheapest badge and glow on #1 only, moving it when a cheaper quote arrives', async () => {
    store.search(REQ);
    await emit(started(), quote('C', 1500));
    expect(card('C').querySelector('[data-testid="cheapest-badge"]')).not.toBeNull();
    expect(card('C').classList).toContain('is-cheapest');

    await emit(quote('A', 900), quote('D', 1700));
    expect(el.querySelectorAll('[data-testid="cheapest-badge"]').length).toBe(1);
    expect(card('A').querySelector('[data-testid="cheapest-badge"]')).not.toBeNull();
    expect(card('A').classList).toContain('is-cheapest');
    expect(card('C').classList).not.toContain('is-cheapest');
    expect(card('C').querySelector('[data-testid="cheapest-badge"]')).toBeNull();
  });

  it('shows the no-price message when the search finished without quotes', async () => {
    store.search(REQ);
    await emit(started(), end('Completed'));
    expect(text(el)).toContain('No supplier returned a price this time. Try again.');
    expect(el.querySelectorAll('[data-testid="result-skeleton"]').length).toBe(0);
  });

  it('keeps the cards (no message) when the search finished with quotes', async () => {
    store.search(REQ);
    await emit(started(), quote('A', 900), end('Completed'));
    expect(cards().length).toBe(1);
    expect(text(el)).not.toContain('No supplier returned a price');
  });
});
