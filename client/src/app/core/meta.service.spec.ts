import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MetaService } from './meta.service';

describe('MetaService', () => {
  let service: MetaService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MetaService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('fetches locations once and caches them', () => {
    const got: unknown[] = [];
    service.locations().subscribe((l) => got.push(l));
    service.locations().subscribe((l) => got.push(l));
    const loc = [{ code: 'CNSHA', name: 'Shanghai', countryCode: 'CN', label: 'Shanghai, CN' }];
    http.expectOne('http://localhost:5080/api/meta/locations').flush(loc);
    service.locations().subscribe((l) => got.push(l));
    expect(got).toEqual([loc, loc, loc]);
  });

  it('fetches suppliers once and caches them', () => {
    const got: unknown[] = [];
    service.suppliers().subscribe((s) => got.push(s));
    http.expectOne('http://localhost:5080/api/meta/suppliers').flush([{ code: 'A', name: 'Supplier A' }]);
    service.suppliers().subscribe((s) => got.push(s));
    expect(got.length).toBe(2);
  });
});
