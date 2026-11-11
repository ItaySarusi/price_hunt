import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { environment } from '../../environments/environment';
import { Location, Supplier } from './api.models';

/** Catalog data (locations, suppliers). Each list is fetched once and replayed to later subscribers. */
@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly http = inject(HttpClient);
  private readonly locations$ = this.http
    .get<Location[]>(`${environment.apiBaseUrl}/meta/locations`)
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));
  private readonly suppliers$ = this.http
    .get<Supplier[]>(`${environment.apiBaseUrl}/meta/suppliers`)
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  locations(): Observable<Location[]> {
    return this.locations$;
  }

  suppliers(): Observable<Supplier[]> {
    return this.suppliers$;
  }
}
