import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { HistoryQuery, HistoryRow, PagedResult } from './api.models';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);

  query(q: HistoryQuery): Observable<PagedResult<HistoryRow>> {
    return this.http.get<PagedResult<HistoryRow>>(`${environment.apiBaseUrl}/history`, { params: toParams(q) });
  }
}

function toParams(q: HistoryQuery): HttpParams {
  let params = new HttpParams().set('start', q.start).set('end', q.end);
  for (const code of q.suppliers ?? []) params = params.append('suppliers', code); // repeated: suppliers=A&suppliers=B
  if (q.from) params = params.set('from', q.from);
  if (q.to) params = params.set('to', q.to);
  if (q.includeFailures !== undefined) params = params.set('includeFailures', String(q.includeFailures));
  if (q.sortBy) params = params.set('sortBy', q.sortBy);
  if (q.sortDir) params = params.set('sortDir', q.sortDir);
  if (q.page !== undefined) params = params.set('page', q.page);
  if (q.pageSize !== undefined) params = params.set('pageSize', q.pageSize);
  return params;
}
