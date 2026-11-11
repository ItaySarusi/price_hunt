import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { SearchEvent, SearchRequest } from '../../core/api.models';
import { SearchStreamService } from '../../core/search-stream.service';
import { SearchStore } from './search.store';
import { SupplierStatusStrip, chipTooltip } from './supplier-status-strip';

const REQ: SearchRequest = {
  fromLocation: 'CNSHA', toLocation: 'USLAX', fromDate: '2026-11-20', toDate: '2026-11-30',
  suppliers: ['D', 'A', 'C', 'B'],
};
const started = (): SearchEvent => ({
  type: 'started',
  data: { searchId: 's1', total: 4, suppliers: ['A', 'B', 'C', 'D'], timeoutMs: 6000, startedAt: '2026-11-09T10:00:00Z' },
});
const quote = (supplier: string, responseTimeMs: number): SearchEvent => ({
  type: 'quote',
  data: { searchId: 's1', supplier, supplierName: `Supplier ${supplier}`, price: 1000, currency: 'USD', responseTimeMs, receivedAt: '2026-11-09T10:00:02Z' },
});
const failed = (supplier: string, reason: string, responseTimeMs: number): SearchEvent => ({
  type: 'supplier-failed',
  data: { searchId: 's1', supplier, supplierName: `Supplier ${supplier}`, reason, responseTimeMs, receivedAt: '2026-11-09T10:00:01Z' },
});
const timedOut = (): SearchEvent => ({
  type: 'end',
  data: { searchId: 's1', status: 'TimedOut', total: 4, responded: 2, succeeded: 1, failed: 1, noResponse: 2, elapsedMs: 6000 },
});

describe('SupplierStatusStrip', () => {
  let fixture: ComponentFixture<SupplierStatusStrip>;
  let store: SearchStore;
  let events: Subject<SearchEvent>;
  let el: HTMLElement;

  const chip = (code: string) => el.querySelector<HTMLElement>(`[data-testid="status-chip-${code}"]`);
  const chipText = (code: string) => chip(code)?.textContent?.replace(/\s+/g, ' ').trim();
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
    events = new Subject<SearchEvent>();
    TestBed.configureTestingModule({
      imports: [SupplierStatusStrip],
      providers: [{ provide: SearchStreamService, useValue: { stream: () => events } }],
    });
    store = TestBed.inject(SearchStore);
    fixture = TestBed.createComponent(SupplierStatusStrip);
    el = fixture.nativeElement;
    store.search(REQ);
    await emit(started());
  });

  it('renders one chip per selected supplier in A→G order', () => {
    const ids = [...el.querySelectorAll('[data-testid^="status-chip-"]')].map((e) => e.getAttribute('data-testid'));
    expect(ids).toEqual(['status-chip-A', 'status-chip-B', 'status-chip-C', 'status-chip-D']);
  });

  it('shows a 14 px spinner while waiting', () => {
    const spinner = chip('A')!.querySelector('mat-progress-spinner') as HTMLElement;
    expect(spinner).not.toBeNull();
    expect(spinner.style.width).toBe('14px');
    expect(chip('A')!.dataset['state']).toBe('waiting');
  });

  it('shows ✓ + response time on success, ✕ Failed on failure', async () => {
    await emit(quote('B', 1830), failed('C', 'Rate limit exceeded', 920));
    expect(chipText('B')).toContain('1.83 s');
    expect(chip('B')!.classList).toContain('ph-tag--success');
    expect(chip('B')!.querySelector('mat-icon')?.textContent?.trim()).toBe('check');

    expect(chipText('C')).toContain('Failed');
    expect(chip('C')!.classList).toContain('ph-tag--danger');
    expect(chip('C')!.querySelector('mat-icon')?.textContent?.trim()).toBe('close');
    expect(chip('B')!.querySelector('mat-progress-spinner')).toBeNull();
  });

  it('marks waiting suppliers as No response (warning) on TimedOut', async () => {
    await emit(quote('B', 1830), failed('C', 'boom', 920), timedOut());
    expect(chipText('A')).toContain('No response');
    expect(chip('A')!.classList).toContain('ph-tag--warning');
    expect(chipText('D')).toContain('No response');
    expect(chipText('B')).toContain('1.83 s');
  });

  it('marks waiting suppliers as Cancelled (neutral) on cancel', async () => {
    await emit(quote('B', 1830));
    store.cancel();
    await render();
    expect(chipText('A')).toContain('Cancelled');
    expect(chip('A')!.classList).toContain('ph-tag--neutral');
  });

  it('exposes the supplier name and state as text for screen readers', async () => {
    expect(chipText('A')).toContain('Supplier A');
    expect(chipText('A')).toContain('waiting');
    expect(el.querySelector('ul')?.getAttribute('aria-label')).toBe('Supplier status');
  });
});

describe('chipTooltip', () => {
  it('shows the response time for a success', () => {
    expect(chipTooltip('A', { state: 'success', responseTimeMs: 1830 })).toBe('Supplier A · responded in 1.83 s');
  });
  it('shows the reason (and response time) for a failure', () => {
    expect(chipTooltip('C', { state: 'failed', responseTimeMs: 920, reason: 'Rate limit exceeded' })).toBe(
      'Supplier C · Rate limit exceeded (0.92 s)',
    );
  });
  it('describes waiting, no response and cancelled', () => {
    expect(chipTooltip('A', { state: 'waiting' })).toBe('Supplier A · waiting for a response');
    expect(chipTooltip('G', { state: 'noResponse' })).toBe('Supplier G · no response before the timeout');
    expect(chipTooltip('A', { state: 'cancelled' })).toBe('Supplier A · cancelled');
  });
});
