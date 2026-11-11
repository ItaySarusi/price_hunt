import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { HistorySortBy, SortDir } from '../../core/api.models';
import { HistoryRowView } from './history-row-view';

export interface HistorySort {
  sort: HistorySortBy;
  dir: SortDir;
}

/**
 * Server-side sorted History table (SPEC §11.4). Column ids ARE the API `sortBy` keys, so a header click maps 1:1.
 * Stateless: the active sort comes from the URL via inputs; clicks are only reported upwards.
 */
@Component({
  selector: 'ph-history-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTableModule, MatSortModule, MatTooltipModule],
  template: `
    <div class="scroller">
      <table
        mat-table
        class="table"
        data-testid="history-table"
        aria-label="Price history"
        [dataSource]="rows()"
        [trackBy]="trackById"
        matSort
        matSortDisableClear
        [matSortActive]="sort()"
        [matSortDirection]="direction()"
        (matSortChange)="onSort($event)"
      >
        <ng-container matColumnDef="date">
          <th mat-header-cell *matHeaderCellDef mat-sort-header sortActionDescription="Sort by date">Date</th>
          <td mat-cell *matCellDef="let r">
            <span class="dates ph-tabular" [matTooltip]="r.searched" matTooltipPosition="above" tabindex="0">{{
              r.dates
            }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="route">
          <th mat-header-cell *matHeaderCellDef mat-sort-header sortActionDescription="Sort by route">Route</th>
          <td mat-cell *matCellDef="let r" class="route">
            <span class="nw">{{ r.fromLabel }} →</span>{{ ' ' }}<span class="nw">{{ r.toLabel }}</span>
          </td>
        </ng-container>

        <ng-container matColumnDef="supplier">
          <th mat-header-cell *matHeaderCellDef mat-sort-header sortActionDescription="Sort by supplier">Supplier</th>
          <td mat-cell *matCellDef="let r">
            <span class="supplier">
              <span [class]="'ph-dot dot ph-supplier-' + r.supplierCode" aria-hidden="true"></span>{{ r.supplierName }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="price">
          <th
            mat-header-cell
            *matHeaderCellDef
            mat-sort-header
            arrowPosition="before"
            class="num"
            sortActionDescription="Sort by price"
          >
            Price
          </th>
          <td mat-cell *matCellDef="let r" class="num price" [class.is-empty]="r.price === '—'">{{ r.price }}</td>
        </ng-container>

        <ng-container matColumnDef="responseTime">
          <th
            mat-header-cell
            *matHeaderCellDef
            mat-sort-header
            arrowPosition="before"
            class="num"
            sortActionDescription="Sort by response time"
          >
            Response time
          </th>
          <td mat-cell *matCellDef="let r" class="num ms">{{ r.responseTime }}</td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef mat-sort-header sortActionDescription="Sort by status">Status</th>
          <td mat-cell *matCellDef="let r">
            @if (r.statusTooltip) {
              <span
                [class]="'ph-tag ph-tag--' + r.statusTone"
                [matTooltip]="r.statusTooltip"
                matTooltipPosition="left"
                tabindex="0"
                >{{ r.statusLabel }}</span
              >
            } @else {
              <span [class]="'ph-tag ph-tag--' + r.statusTone">{{ r.statusLabel }}</span>
            }
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let r; columns: columns" data-testid="history-row"></tr>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .scroller {
      overflow-x: auto;
    }
    .table {
      width: 100%;
      min-width: 680px;
    }
    /* Desktop: fixed column widths so columns don't jump when the sort/page changes. */
    @media (min-width: 1024px) {
      .table {
        table-layout: fixed;
      }
      .mat-column-date {
        width: 20%;
      }
      .mat-column-route {
        width: 27%;
      }
      .mat-column-supplier {
        width: 15%;
      }
      .mat-column-price {
        width: 12%;
      }
      .mat-column-responseTime {
        width: 13%;
      }
      .mat-column-status {
        width: 13%;
      }
    }
    @media (max-width: 1023.98px) {
      .mat-mdc-header-cell,
      .mat-mdc-cell {
        padding: 0 10px;
      }
      .mat-mdc-header-cell.mat-column-responseTime {
        width: 64px;
        white-space: normal;
      }
    }
    .num {
      text-align: right;
    }
    .dates {
      white-space: nowrap;
      border-radius: 6px;
      outline: none;
    }
    .dates:focus-visible {
      box-shadow: var(--ph-focus-ring);
    }
    .route {
      color: var(--ph-text);
    }
    /* Wraps only between origin and destination, never inside a place name. */
    .nw {
      white-space: nowrap;
    }
    .supplier {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
    }
    .dot {
      width: 10px;
      height: 10px;
      box-shadow: 0 0 6px color-mix(in srgb, var(--supplier) 60%, transparent);
    }
    .price {
      font-family: var(--ph-font-display);
      font-weight: 600;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .price.is-empty {
      color: var(--ph-text-muted);
      font-weight: 500;
    }
    .ms {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--ph-text);
    }
    .ph-tag[tabindex]:focus-visible {
      outline: none;
      box-shadow: var(--ph-focus-ring);
    }
  `,
})
export class HistoryTableComponent {
  readonly rows = input.required<readonly HistoryRowView[]>();
  readonly sort = input.required<HistorySortBy>();
  readonly direction = input.required<SortDir>();
  readonly sortChange = output<HistorySort>();

  protected readonly columns: HistorySortBy[] = ['date', 'route', 'supplier', 'price', 'responseTime', 'status'];
  protected readonly trackById = (_: number, r: HistoryRowView) => r.id;

  protected onSort(e: Sort): void {
    this.sortChange.emit({ sort: e.active as HistorySortBy, dir: e.direction === 'desc' ? 'desc' : 'asc' });
  }
}
