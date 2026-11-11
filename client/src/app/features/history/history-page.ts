import { HttpErrorResponse } from '@angular/common/http';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, combineLatest, map, merge, of, switchMap, take, tap } from 'rxjs';

import { HistoryRow, Location, PagedResult, Supplier } from '../../core/api.models';
import { HistoryService } from '../../core/history.service';
import { MetaService } from '../../core/meta.service';
import { PageHeader } from '../../shared/page-header';
import { HistoryCardsComponent } from './history-cards';
import { HistoryFilterValue, HistoryFiltersComponent } from './history-filters';
import { toRowView } from './history-row-view';
import { HistorySort, HistoryTableComponent } from './history-table';
import { HistoryFilters, PAGE_SIZES, defaultFilters, filtersFromParams, paramsFromFilters, toHistoryQuery } from './history-url';

type LoadResult = { ok: true; data: PagedResult<HistoryRow> } | { ok: false; badRequest: boolean };

/**
 * History screen (SPEC §11.4). The URL query string is the single source of truth: every user action (Apply, Reset,
 * sort, paging) navigates; the route's queryParamMap drives the API call (switchMap cancels stale requests), so
 * Back/Forward and shared links restore the exact view.
 */
@Component({
  selector: 'ph-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeader,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    HistoryFiltersComponent,
    HistoryTableComponent,
    HistoryCardsComponent,
  ],
  template: `
    <ph-page-header title="Price history" subtitle="Every quote we've collected" />

    @if (catalog(); as c) {
      <ph-history-filters
        [filters]="filters()"
        [locations]="c.locations"
        [suppliers]="c.suppliers"
        (applied)="apply($event)"
        (resetRequested)="reset()"
      />
    } @else {
      <div class="ph-glass filters-placeholder" aria-busy="true">
        @if (catalogError()) {
          <p class="muted" role="alert">Couldn't load locations and suppliers. Is the API running?</p>
        } @else {
          <span class="ph-sr-only">Loading filters…</span>
          @for (w of [32, 22, 20, 20]; track $index) {
            <span class="ph-skeleton sk" [style.flex-basis.%]="w" aria-hidden="true"></span>
          }
        }
      </div>
    }

    @if (error()) {
      <div class="ph-glass banner" role="alert" data-testid="history-error">
        <mat-icon class="banner__icon" aria-hidden="true">error</mat-icon>
        <p class="banner__title">Couldn't load history.</p>
        <button type="button" class="ph-btn banner__retry" data-testid="retry-btn" (click)="retry()">
          <mat-icon aria-hidden="true">refresh</mat-icon>Retry
        </button>
      </div>
    }

    @if (result(); as r) {
      <section class="ph-glass results" [class.is-loading]="loading()" aria-label="Results" [attr.aria-busy]="loading()">
        <div class="loading-bar" aria-hidden="true">
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
        </div>

        @if (r.totalCount === 0) {
          <div class="empty" data-testid="history-empty">
            <span class="empty__icon" aria-hidden="true"><mat-icon>search_off</mat-icon></span>
            <p class="empty__title">No prices match these filters.</p>
            <p class="empty__hint">Try a wider date range, more suppliers or turning on failures.</p>
            <button type="button" class="ph-btn" data-testid="empty-reset-btn" (click)="reset()">
              <mat-icon aria-hidden="true">restart_alt</mat-icon>Reset filters
            </button>
          </div>
        } @else {
          @if (isPhone()) {
            <ph-history-cards [rows]="rows()" [sort]="filters().sort" [direction]="filters().dir" (sortChange)="sortBy($event)" />
          } @else {
            <ph-history-table [rows]="rows()" [sort]="filters().sort" [direction]="filters().dir" (sortChange)="sortBy($event)" />
          }
          <mat-paginator
            class="paginator"
            data-testid="paginator"
            aria-label="Select page of price history"
            [length]="r.totalCount"
            [pageIndex]="filters().page - 1"
            [pageSize]="filters().size"
            [pageSizeOptions]="pageSizes"
            [hidePageSize]="isPhone()"
            showFirstLastButtons
            (page)="onPage($event)"
          />
        }
      </section>
    } @else if (!error()) {
      <section class="ph-glass results" aria-busy="true" aria-label="Results">
        <span class="ph-sr-only">Loading history…</span>
        <div class="loading-bar" aria-hidden="true"><mat-progress-bar mode="indeterminate" /></div>
        <div class="skeleton-rows" aria-hidden="true">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <span class="ph-skeleton sk-row"></span>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .filters-placeholder {
      display: flex;
      gap: 16px;
      padding: 20px 24px;
      min-height: 150px;
    }
    .sk {
      height: 56px;
      border-radius: 12px;
    }
    .muted {
      margin: 0;
      color: var(--ph-text-muted);
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 20px;
      padding: 12px 12px 12px 18px;
      border-color: rgba(248, 113, 113, 0.4);
      background: linear-gradient(rgba(248, 113, 113, 0.14), rgba(248, 113, 113, 0.14)), var(--ph-glass-bg);
    }
    .banner__icon {
      flex: none;
      color: var(--ph-danger);
    }
    .banner__title {
      flex: 1;
      margin: 0;
      font-weight: 600;
      color: var(--ph-text);
    }
    .results {
      position: relative;
      margin-top: 20px;
      overflow: hidden;
    }
    .loading-bar {
      position: absolute;
      inset: 0 0 auto;
      z-index: 2;
      height: 3px;
    }
    .results.is-loading ph-history-table,
    .results.is-loading ph-history-cards {
      opacity: 0.75;
      transition: opacity var(--ph-dur) ease-out;
    }
    .paginator {
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .empty {
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 48px 24px;
      text-align: center;
    }
    .empty__icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin-bottom: 8px;
      border-radius: 50%;
      background: var(--ph-neu-surface);
      box-shadow: var(--ph-neu-inset);
      color: var(--ph-teal);
    }
    .empty__title {
      margin: 0;
      font: 600 18px/1.3 var(--ph-font-display);
      color: var(--ph-text);
    }
    .empty__hint {
      margin: 0 0 12px;
      color: var(--ph-text-muted);
    }
    .skeleton-rows {
      display: grid;
      gap: 14px;
      padding: 28px 24px;
    }
    .sk-row {
      height: 22px;
    }
    @media (max-width: 599.98px) {
      .filters-placeholder {
        flex-direction: column;
        min-height: 360px;
        padding: 16px;
      }
      .sk {
        flex: none;
      }
      .empty {
        padding: 36px 16px;
      }
    }
  `,
})
export default class HistoryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly history = inject(HistoryService);
  private readonly meta = inject(MetaService);

  /** Fixed per page instance so parsing and serialising agree on the default date range. */
  private readonly today = new Date();
  private readonly retry$ = new Subject<void>();

  protected readonly pageSizes = [...PAGE_SIZES];
  protected readonly filters = toSignal(
    this.route.queryParamMap.pipe(map((p) => filtersFromParams(p, this.today))),
    { requireSync: true },
  );
  protected readonly result = signal<PagedResult<HistoryRow> | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal(false);
  protected readonly rows = computed(() => (this.result()?.items ?? []).map(toRowView));
  protected readonly isPhone = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 599.98px)')
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly catalog = signal<{ locations: Location[]; suppliers: Supplier[] } | null>(null);
  protected readonly catalogError = signal(false);

  constructor() {
    combineLatest({ locations: this.meta.locations(), suppliers: this.meta.suppliers() })
      .pipe(take(1), takeUntilDestroyed())
      .subscribe({ next: (c) => this.catalog.set(c), error: () => this.catalogError.set(true) });

    const filters$ = this.route.queryParamMap.pipe(map((p) => filtersFromParams(p, this.today)));
    merge(filters$, this.retry$.pipe(map(() => this.filters())))
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap((f) =>
          this.history.query(toHistoryQuery(f)).pipe(
            map((data): LoadResult => ({ ok: true, data })),
            catchError((e: unknown) => of<LoadResult>({ ok: false, badRequest: e instanceof HttpErrorResponse && e.status === 400 })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (!res.ok) {
          // A hand-edited link with a location code the catalog doesn't know: the API answers 400 — drop them and reload.
          const f = this.filters();
          if (res.badRequest && (f.from || f.to)) {
            this.go({ ...f, from: null, to: null, page: 1 }, true);
            return;
          }
          this.error.set(true);
          this.result.set(null);
          return;
        }
        const { data } = res;
        // Page past the end (e.g. an old link after the data shrank): jump to the last page instead of an empty table.
        if (data.items.length === 0 && data.totalCount > 0 && this.filters().page > 1) {
          this.go({ ...this.filters(), page: Math.max(1, data.totalPages) }, true);
          return;
        }
        this.result.set(data);
      });
  }

  protected apply(v: HistoryFilterValue): void {
    this.go({ ...this.filters(), ...v, page: 1 });
  }

  protected reset(): void {
    this.go(defaultFilters(this.today));
  }

  protected retry(): void {
    this.retry$.next();
  }

  protected sortBy(s: HistorySort): void {
    this.go({ ...this.filters(), sort: s.sort, dir: s.dir, page: 1 });
  }

  protected onPage(e: PageEvent): void {
    this.go({ ...this.filters(), page: e.pageIndex + 1, size: e.pageSize as HistoryFilters['size'] });
  }

  /** Navigate to the state; if the URL wouldn't change (e.g. Apply with unchanged filters), just reload. */
  private go(f: HistoryFilters, replaceUrl = false): void {
    const queryParams = paramsFromFilters(f, this.today);
    const current = paramsFromFilters(this.filters(), this.today);
    if (JSON.stringify(queryParams) === JSON.stringify(current)) {
      this.retry$.next();
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl });
  }
}
