import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { HistorySortBy, SortDir } from '../../core/api.models';
import { HistoryRowView } from './history-row-view';
import { HistorySort } from './history-table';

export const SORT_LABELS: Record<HistorySortBy, string> = {
  date: 'Date',
  route: 'Route',
  supplier: 'Supplier',
  price: 'Price',
  responseTime: 'Response time',
  status: 'Status',
};

/**
 * Phone layout of the History list (SPEC §11.5): a "Sort by" select + direction toggle, then one row card per
 * quote (Route as title; Date, Supplier, Price, Response time, Status as label/value pairs). Cards are tinted, not
 * blurred — the surrounding results container is the single blurred layer (SPEC §11.1 performance).
 */
@Component({
  selector: 'ph-history-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatIconModule, MatSelectModule, MatTooltipModule],
  template: `
    <div class="sortbar">
      <mat-form-field class="sortby">
        <mat-label>Sort by</mat-label>
        <mat-select [value]="sort()" (selectionChange)="sortChange.emit({ sort: $event.value, dir: 'asc' })">
          @for (c of columns; track c) {
            <mat-option [value]="c">{{ labels[c] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <button
        type="button"
        class="ph-btn ph-btn--icon dir"
        data-testid="sort-dir"
        [attr.aria-label]="direction() === 'asc' ? 'Sorted ascending, switch to descending' : 'Sorted descending, switch to ascending'"
        [title]="direction() === 'asc' ? 'Ascending' : 'Descending'"
        (click)="sortChange.emit({ sort: sort(), dir: direction() === 'asc' ? 'desc' : 'asc' })"
      >
        <mat-icon aria-hidden="true">{{ direction() === 'asc' ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
      </button>
    </div>

    <ul class="cards" aria-label="Price history">
      @for (r of rows(); track r.id) {
        <li class="row-card" data-testid="history-card">
          <p class="title">{{ r.route }}</p>
          <dl class="pairs">
            <div class="pair">
              <dt>Date</dt>
              <dd class="ph-tabular">{{ r.dates }}</dd>
            </div>
            <div class="pair">
              <dt>Supplier</dt>
              <dd>
                <span class="supplier"
                  ><span [class]="'ph-dot ph-supplier-' + r.supplierCode" aria-hidden="true"></span
                  >{{ r.supplierName }}</span
                >
              </dd>
            </div>
            <div class="pair">
              <dt>Price</dt>
              <dd class="price" [class.is-empty]="r.price === '—'">{{ r.price }}</dd>
            </div>
            <div class="pair">
              <dt>Response time</dt>
              <dd class="ph-tabular">{{ r.responseTime }}</dd>
            </div>
            <div class="pair">
              <dt>Status</dt>
              <dd>
                <span [class]="'ph-tag ph-tag--' + r.statusTone">{{ r.statusLabel }}</span>
                @if (r.statusTooltip) {
                  <span class="error">{{ r.statusTooltip }}</span>
                }
              </dd>
            </div>
          </dl>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .sortbar {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 16px 4px;
    }
    .sortby {
      flex: 1;
      min-width: 0;
    }
    .dir {
      margin-top: 6px;
    }
    .cards {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 12px 12px 4px;
      list-style: none;
    }
    .row-card {
      padding: 14px 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--ph-radius-card);
      background: rgba(255, 255, 255, 0.045);
      box-shadow: var(--ph-glass-highlight), 0 4px 16px rgba(0, 0, 0, 0.25);
    }
    .title {
      margin: 0 0 10px;
      font: 600 15px/1.35 var(--ph-font-display);
      letter-spacing: -0.01em;
      color: var(--ph-text);
    }
    .pairs {
      display: grid;
      gap: 8px;
      margin: 0;
    }
    .pair {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 26px;
    }
    dt {
      color: var(--ph-text-muted);
      font-size: 13px;
    }
    dd {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--ph-text);
      font-size: 14px;
      text-align: right;
    }
    .supplier {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .price {
      font: 600 16px/1 var(--ph-font-display);
      font-variant-numeric: tabular-nums;
    }
    .price.is-empty {
      color: var(--ph-text-muted);
      font-weight: 500;
    }
    .error {
      max-width: 120px;
      overflow: hidden;
      color: var(--ph-text-muted);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class HistoryCardsComponent {
  readonly rows = input.required<readonly HistoryRowView[]>();
  readonly sort = input.required<HistorySortBy>();
  readonly direction = input.required<SortDir>();
  readonly sortChange = output<HistorySort>();

  protected readonly columns = Object.keys(SORT_LABELS) as HistorySortBy[];
  protected readonly labels = SORT_LABELS;
}
