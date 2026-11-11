import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { EndEvent, SearchEvent, SearchRequest } from '../../core/api.models';
import { SearchStreamService } from '../../core/search-stream.service';
import { ProgressPanel } from './progress-panel';
import { SearchStore } from './search.store';

const REQ: SearchRequest = {
  fromLocation: 'CNSHA', toLocation: 'USLAX', fromDate: '2026-11-20', toDate: '2026-11-30',
  suppliers: ['A', 'B', 'C', 'D'],
};

const started = (suppliers = ['A', 'B', 'C', 'D']): SearchEvent => ({
  type: 'started',
  data: { searchId: 's1', total: suppliers.length, suppliers, timeoutMs: 6000, startedAt: '2026-11-09T10:00:00Z' },
});
const quote = (supplier: string, responseTimeMs = 1830, price = 1000): SearchEvent => ({
  type: 'quote',
  data: {
    searchId: 's1', supplier, supplierName: `Supplier ${supplier}`, price, currency: 'USD', responseTimeMs,
    receivedAt: '2026-11-09T10:00:02Z',
  },
});
const failed = (supplier: string, reason = 'Rate limit exceeded', responseTimeMs = 900): SearchEvent => ({
  type: 'supplier-failed',
  data: { searchId: 's1', supplier, supplierName: `Supplier ${supplier}`, reason, responseTimeMs, receivedAt: '2026-11-09T10:00:01Z' },
});
const end = (status: EndEvent['status']): SearchEvent => ({
  type: 'end',
  data: { searchId: 's1', status, total: 4, responded: 3, succeeded: 2, failed: 1, noResponse: 1, elapsedMs: 6000 },
});

describe('ProgressPanel', () => {
  let fixture: ComponentFixture<ProgressPanel>;
  let store: SearchStore;
  let events: Subject<SearchEvent>;
  let el: HTMLElement;

  const byTestId = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const txt = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const emit = async (...evs: SearchEvent[]) => {
    for (const e of evs) events.next(e);
    await render();
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
    events = new Subject<SearchEvent>();
    TestBed.configureTestingModule({
      imports: [ProgressPanel],
      providers: [{ provide: SearchStreamService, useValue: { stream: () => events } }],
    });
    store = TestBed.inject(SearchStore);
    fixture = TestBed.createComponent(ProgressPanel);
    el = fixture.nativeElement;
    await render();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('renders nothing while idle', () => {
    expect(byTestId('progress-text')).toBeNull();
    expect(el.querySelector('.ph-glass')).toBeNull();
  });

  it('shows the counter in a polite live region and updates it as suppliers respond', async () => {
    store.search(REQ);
    await emit(started());
    expect(txt('progress-text')).toBe('0 of 4 suppliers responded');
    expect(byTestId('progress-text')?.getAttribute('aria-live')).toBe('polite');

    await emit(quote('B'), failed('A'));
    expect(txt('progress-text')).toBe('2 of 4 suppliers responded');
  });

  it('drives the determinate bar from responded / total and shows the sheen only while running', async () => {
    store.search(REQ);
    await emit(started(), quote('A'));
    const bar = el.querySelector('mat-progress-bar')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(el.querySelector('.ph-progress')?.classList.contains('is-running')).toBe(true);

    await emit(end('Completed'));
    expect(el.querySelector('.ph-progress')?.classList.contains('is-running')).toBe(false);
  });

  it('counts down from started.timeoutMs every 100 ms and clamps at 0.0', async () => {
    store.search(REQ);
    await render();
    expect(byTestId('countdown')).toBeNull(); // no timeout known before `started`

    await emit(started());
    expect(txt('countdown')).toBe('6.0 s left');

    vi.advanceTimersByTime(1800);
    await render();
    expect(txt('countdown')).toBe('4.2 s left');

    vi.advanceTimersByTime(10_000);
    await render();
    expect(txt('countdown')).toBe('0.0 s left');
  });

  it('never shows more than the full timeout when the clock tick lags behind started', async () => {
    store.search(REQ);
    await render(); // the 100 ms clock is sampled now
    vi.setSystemTime(new Date('2026-11-09T10:00:00.080Z')); // `started` arrives 80 ms later, before the next tick
    await emit(started());
    expect(txt('countdown')).toBe('6.0 s left');
  });

  it('stops the interval when the search ends', async () => {
    store.search(REQ);
    await emit(started());
    expect(vi.getTimerCount()).toBe(1);
    await emit(end('Completed'));
    expect(vi.getTimerCount()).toBe(0);
    expect(byTestId('countdown')).toBeNull();
  });

  it('stops the interval when the panel is destroyed mid-search', async () => {
    store.search(REQ);
    await emit(started());
    expect(vi.getTimerCount()).toBe(1);
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['Completed', 'Completed', 'ph-tag--success'],
    ['TimedOut', 'Timed out', 'ph-tag--warning'],
  ] as const)('shows the %s badge from the server end event', async (status, label, tone) => {
    store.search(REQ);
    await emit(started());
    expect(byTestId('final-badge')).toBeNull();
    await emit(end(status));
    expect(txt('final-badge')).toContain(label);
    expect(byTestId('final-badge')?.classList).toContain(tone);
  });

  it('shows a neutral Cancelled badge when the user cancels', async () => {
    store.search(REQ);
    await emit(started(), quote('A'));
    store.cancel();
    await render();
    expect(txt('final-badge')).toContain('Cancelled');
    expect(byTestId('final-badge')?.classList).toContain('ph-tag--neutral');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows a danger Connection lost badge when the stream errors before end', async () => {
    store.search(REQ);
    await emit(started());
    events.error(new Error('network'));
    await render();
    expect(txt('final-badge')).toContain('Connection lost');
    expect(byTestId('final-badge')?.classList).toContain('ph-tag--danger');
  });

  it('shows a muted "waiting" hint in the summary line while running, replaced by the summary at the end', async () => {
    store.search(REQ);
    await emit(started(), quote('A'));
    expect(txt('progress-waiting')).toBe('Waiting for 3 suppliers…');
    await emit(quote('B'), quote('C'));
    expect(txt('progress-waiting')).toBe('Waiting for 1 supplier…');
    await emit(end('TimedOut'));
    expect(byTestId('progress-waiting')).toBeNull();
  });

  it('shows the summary only after the end', async () => {
    store.search(REQ);
    await emit(started(), quote('A'), quote('B'), failed('C'));
    expect(byTestId('progress-summary')).toBeNull();
    await emit(end('TimedOut'));
    expect(txt('progress-summary')).toBe('2 prices · 1 failed · 1 no response');
  });

  it('includes cancelled suppliers in the summary after a cancel', async () => {
    store.search(REQ);
    await emit(started(), quote('A'));
    store.cancel();
    await render();
    expect(txt('progress-summary')).toBe('1 price · 0 failed · 0 no response · 3 cancelled');
  });

  it('stays visible after the search ends', async () => {
    store.search(REQ);
    await emit(started(), end('Completed'));
    expect(byTestId('progress-text')).not.toBeNull();
  });

  it('includes the supplier status strip', async () => {
    store.search(REQ);
    await emit(started());
    expect(el.querySelector('ph-supplier-status-strip')).not.toBeNull();
    expect(byTestId('status-chip-A')).not.toBeNull();
  });
});
