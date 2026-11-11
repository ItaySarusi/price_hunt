import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { formatResponseMs } from '../../shared/format';
import { SearchStore, SupplierState, SupplierStatus } from './search.store';

const TONE: Record<SupplierState, string> = {
  waiting: 'ph-tag--waiting',
  success: 'ph-tag--success',
  failed: 'ph-tag--danger',
  noResponse: 'ph-tag--warning',
  cancelled: 'ph-tag--neutral',
};

const WAITING: SupplierStatus = { state: 'waiting' };

/** Tooltip text for a supplier status chip (SPEC §11.3: failed → reason; otherwise the response time). */
export function chipTooltip(code: string, s: SupplierStatus): string {
  const name = `Supplier ${code}`;
  switch (s.state) {
    case 'success':
      return `${name} · responded in ${formatResponseMs(s.responseTimeMs)}`;
    case 'failed':
      return `${name} · ${s.reason ?? 'Failed'} (${formatResponseMs(s.responseTimeMs)})`;
    case 'noResponse':
      return `${name} · no response before the timeout`;
    case 'cancelled':
      return `${name} · cancelled`;
    default:
      return `${name} · waiting for a response`;
  }
}

/** One status chip per selected supplier, A→G (SPEC §11.3 "Supplier status strip"). */
@Component({
  selector: 'ph-supplier-status-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  template: `
    <ul class="strip" aria-label="Supplier status">
      @for (code of store.selectedSuppliers(); track code) {
        @let s = statusOf(code);
        <li>
          <span
            class="ph-tag chip"
            [class]="tone[s.state] + ' ph-supplier-' + code"
            [attr.data-testid]="'status-chip-' + code"
            [attr.data-state]="s.state"
            [matTooltip]="tooltip(code, s)"
          >
            <span class="ph-dot" aria-hidden="true"></span>
            <span class="code" aria-hidden="true">{{ code }}</span>
            <span class="ph-sr-only">Supplier {{ code }}:</span>
            @switch (s.state) {
              @case ('success') {
                <mat-icon aria-hidden="true">check</mat-icon>
                <span class="ph-tabular">{{ ms(s.responseTimeMs) }}</span>
              }
              @case ('failed') {
                <mat-icon aria-hidden="true">close</mat-icon>
                <span>Failed</span>
              }
              @case ('noResponse') {
                <mat-icon aria-hidden="true">schedule</mat-icon>
                <span>No response</span>
              }
              @case ('cancelled') {
                <mat-icon aria-hidden="true">block</mat-icon>
                <span>Cancelled</span>
              }
              @default {
                <span class="spin" aria-hidden="true">
                  <mat-progress-spinner mode="indeterminate" [diameter]="14" [strokeWidth]="2" />
                </span>
                <span class="ph-sr-only">waiting</span>
              }
            }
          </span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    /* Fixed minimum width so a chip doesn't grow when it changes from spinner to "✓ 1.83 s" (no re-wrap mid-search). */
    .chip {
      min-width: 104px;
      height: 28px;
      gap: 6px;
      cursor: default;
    }
    .code {
      color: var(--ph-text);
      font-family: var(--ph-font-display);
      font-weight: 700;
    }
    .ph-tag--waiting {
      --tone: var(--ph-text-muted);
      --tone-bg: rgba(148, 163, 184, 0.08);
    }
    /* Faint full ring behind the spinner arc so the waiting state reads clearly at 14 px. */
    .spin {
      display: inline-grid;
      flex: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      box-shadow: inset 0 0 0 2px rgba(148, 163, 184, 0.22);
    }
    /* Phones: an even two-column grid instead of ragged wrapping. */
    @media (max-width: 599.98px) {
      .strip {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
      .chip {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
    }
  `,
})
export class SupplierStatusStrip {
  protected readonly store = inject(SearchStore);
  protected readonly tone = TONE;
  protected readonly tooltip = chipTooltip;
  protected readonly ms = formatResponseMs;

  protected statusOf(code: string): SupplierStatus {
    return (this.store.supplierStates() as Partial<Record<string, SupplierStatus>>)[code] ?? WAITING;
  }
}
