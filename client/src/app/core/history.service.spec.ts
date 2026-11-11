import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HistoryService } from './history.service';
import { PagedResult, HistoryRow } from './api.models';

describe('HistoryService', () => {
  let service: HistoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HistoryService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends required params only when nothing else is given', () => {
    service.query({ start: '2026-11-09', end: '2026-12-09' }).subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:5080/api/history');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual(['end', 'start']);
    req.flush({ items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
  });

  it('sends suppliers as repeated params and all optional params', () => {
    service
      .query({
        start: '2026-11-09', end: '2026-12-09', suppliers: ['A', 'B'], from: 'CNSHA', to: 'USLAX',
        includeFailures: false, sortBy: 'price', sortDir: 'desc', page: 3, pageSize: 50,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:5080/api/history');
    const p = req.request.params;
    expect(p.getAll('suppliers')).toEqual(['A', 'B']);
    expect(p.get('from')).toBe('CNSHA');
    expect(p.get('to')).toBe('USLAX');
    expect(p.get('includeFailures')).toBe('false');
    expect(p.get('sortBy')).toBe('price');
    expect(p.get('sortDir')).toBe('desc');
    expect(p.get('page')).toBe('3');
    expect(p.get('pageSize')).toBe('50');
    req.flush({ items: [], page: 3, pageSize: 50, totalCount: 0, totalPages: 0 });
  });

  it('omits empty/undefined values', () => {
    service.query({ start: 's', end: 'e', suppliers: [], from: '', to: undefined }).subscribe();
    const req = http.expectOne((r) => r.url === 'http://localhost:5080/api/history');
    expect(req.request.params.keys().sort()).toEqual(['end', 'start']);
    req.flush({ items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0 });
  });

  it('returns the paged result', () => {
    let result: PagedResult<HistoryRow> | undefined;
    service.query({ start: 's', end: 'e' }).subscribe((r) => (result = r));
    http.expectOne((r) => r.url.endsWith('/history')).flush({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 0 });
    expect(result?.pageSize).toBe(10);
  });
});
