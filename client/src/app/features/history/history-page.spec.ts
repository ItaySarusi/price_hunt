import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { HistoryQuery, HistoryRow, Location, PagedResult, Supplier } from '../../core/api.models';
import { HistoryService } from '../../core/history.service';
import { MetaService } from '../../core/meta.service';
import HistoryPage from './history-page';

const LOCATIONS: Location[] = [
  { code: 'CNSHA', name: 'Shanghai', countryCode: 'CN', label: 'Shanghai, CN' },
  { code: 'USLAX', name: 'Los Angeles', countryCode: 'US', label: 'Los Angeles, US' },
];
const SUPPLIERS: Supplier[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ code: c, name: `Supplier ${c}` }));

const row = (id: number, patch: Partial<HistoryRow> = {}): HistoryRow => ({
  id,
  searchId: `s${id}`,
  searchedAt: '2026-11-09T12:03:00Z',
  fromDate: '2026-11-20',
  toDate: '2026-11-30',
  from: { code: 'CNSHA', label: 'Shanghai, CN' },
  to: { code: 'USLAX', label: 'Los Angeles, US' },
  supplier: { code: 'A', name: 'Supplier A' },
  status: 'Success',
  price: 1000 + id,
  currency: 'USD',
  responseTimeMs: 1500,
  error: null,
  ...patch,
});

const page = (items: HistoryRow[], totalCount = items.length, p = 1, size = 25): PagedResult<HistoryRow> => ({
  items,
  page: p,
  pageSize: size,
  totalCount,
  totalPages: Math.ceil(totalCount / size),
});

describe('HistoryPage', () => {
  let harness: RouterTestingHarness;
  let query: ReturnType<typeof vi.fn<(q: HistoryQuery) => Observable<PagedResult<HistoryRow>>>>;
  let router: Router;

  const el = () => harness.routeNativeElement as HTMLElement;
  const byTestId = (id: string) => el().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const allByTestId = (id: string) => el().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`);
  const lastQuery = () => query.mock.calls.at(-1)![0];
  const settle = async () => {
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const open = async (url = '/history') => {
    await harness.navigateByUrl(url, HistoryPage);
    await settle();
  };
  const queryParams = () => router.parseUrl(router.url).queryParams;

  beforeEach(async () => {
    query = vi.fn(() => of(page([row(1), row(2, { status: 'Failed', price: null, error: 'Boom' })], 60)));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'history', component: HistoryPage }]),
        provideNativeDateAdapter(),
        { provide: HistoryService, useValue: { query } },
        { provide: MetaService, useValue: { locations: () => of(LOCATIONS), suppliers: () => of(SUPPLIERS) } },
      ],
    });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it('loads the defaults and renders one table row per item', async () => {
    await open();
    expect(lastQuery()).toMatchObject({ includeFailures: true, sortBy: 'date', sortDir: 'asc', page: 1, pageSize: 25 });
    expect(lastQuery().suppliers).toBeUndefined();
    expect(allByTestId('history-row').length).toBe(2);
    const text = byTestId('history-table')!.textContent!;
    expect(text).toContain('Shanghai, CN → Los Angeles, US');
    expect(text).toContain('$1,001.00');
    expect(text).toContain('Failed');
    expect(text).toContain('—');
    expect(byTestId('paginator')!.textContent).toContain('1 – 25 of 60');
  });

  it('restores state from the URL and queries the API with it', async () => {
    await open('/history?suppliers=A,C&failures=0&sort=price&dir=desc&page=2&size=10&from=CNSHA');
    expect(lastQuery()).toMatchObject({
      suppliers: ['A', 'C'],
      includeFailures: false,
      sortBy: 'price',
      sortDir: 'desc',
      page: 2,
      pageSize: 10,
      from: 'CNSHA',
    });
  });

  it.each([
    ['Date', 'date'],
    ['Route', 'route'],
    ['Supplier', 'supplier'],
    ['Price', 'price'],
    ['Response time', 'responseTime'],
    ['Status', 'status'],
  ])('clicking the %s header navigates with sort=%s and the API is re-queried', async (label, key) => {
    await open('/history?page=3');
    const header = [...el().querySelectorAll<HTMLElement>('th .mat-sort-header-container')].find(
      (h) => h.textContent!.trim() === label,
    )!;
    header.click();
    await settle();
    const expected = key === 'date' ? { dir: 'desc' } : { sort: key };
    expect(queryParams()).toEqual(expected); // page reset to 1 → omitted
    expect(lastQuery()).toMatchObject({ sortBy: key, sortDir: key === 'date' ? 'desc' : 'asc', page: 1 });
  });

  it('clicking the active column again flips the direction', async () => {
    await open('/history?sort=price');
    const price = [...el().querySelectorAll<HTMLElement>('th .mat-sort-header-container')].find(
      (h) => h.textContent!.trim() === 'Price',
    )!;
    price.click();
    await settle();
    expect(queryParams()).toEqual({ sort: 'price', dir: 'desc' });
  });

  it('next page navigates with page=2', async () => {
    await open();
    el().querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    await settle();
    expect(queryParams()).toEqual({ page: '2' });
    expect(lastQuery().page).toBe(2);
  });

  it('Apply navigates with the edited filters and resets the page to 1', async () => {
    await open('/history?page=2&sort=route');
    const toggle = byTestId('failures-toggle')!.querySelector<HTMLButtonElement>('button')!;
    toggle.click();
    await settle();
    expect(queryParams()).toEqual({ page: '2', sort: 'route' }); // not applied yet
    byTestId('apply-btn')!.click();
    await settle();
    expect(queryParams()).toEqual({ sort: 'route', failures: '0' });
    expect(lastQuery()).toMatchObject({ includeFailures: false, page: 1, sortBy: 'route' });
  });

  it('Apply with unchanged filters re-queries without changing the URL', async () => {
    await open();
    const calls = query.mock.calls.length;
    byTestId('apply-btn')!.click();
    await settle();
    expect(router.url).toBe('/history');
    expect(query.mock.calls.length).toBe(calls + 1);
  });

  it('Reset navigates back to the defaults (empty query string)', async () => {
    await open('/history?suppliers=B&failures=0&page=2');
    byTestId('reset-btn')!.click();
    await settle();
    expect(router.url).toBe('/history');
    expect(lastQuery()).toMatchObject({ includeFailures: true, page: 1, suppliers: undefined });
  });

  it('shows the empty state with a Reset button when nothing matches', async () => {
    query.mockReturnValue(of(page([], 0)));
    await open('/history?suppliers=G');
    expect(byTestId('history-empty')!.textContent).toContain('No prices match these filters.');
    expect(byTestId('history-table')).toBeNull();
    byTestId('empty-reset-btn')!.click();
    await settle();
    expect(router.url).toBe('/history');
  });

  it('drops an unknown from/to code rejected by the API (400) and reloads without it', async () => {
    query.mockImplementation((q) =>
      q.from === 'ZZZZZ' ? throwError(() => new HttpErrorResponse({ status: 400 })) : of(page([row(1)])),
    );
    await open('/history?from=ZZZZZ&to=USLAX');
    expect(lastQuery().from).toBeUndefined();
    expect(lastQuery().to).toBeUndefined();
    expect(queryParams()).toEqual({});
    expect(byTestId('history-error')).toBeNull();
    expect(allByTestId('history-row').length).toBe(1);
  });

  it('shows the error banner and Retry re-queries', async () => {
    query.mockReturnValue(throwError(() => new Error('down')));
    await open();
    expect(byTestId('history-error')!.textContent).toContain("Couldn't load history.");
    query.mockReturnValue(of(page([row(1)])));
    byTestId('retry-btn')!.click();
    await settle();
    expect(byTestId('history-error')).toBeNull();
    expect(allByTestId('history-row').length).toBe(1);
  });

  it('keeps the previous rows visible while the next page loads', async () => {
    await open();
    query.mockReturnValue(new Observable<PagedResult<HistoryRow>>()); // never resolves
    el().querySelector<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
    await settle();
    expect(allByTestId('history-row').length).toBe(2);
    expect(el().querySelector('mat-progress-bar')).not.toBeNull();
  });
});
