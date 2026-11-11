import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { QuoteEvent } from '../../core/api.models';
import { formatPrice, formatResponseMs } from '../../shared/format';

/**
 * One ranked quote (SPEC §11.3 "Ranked result cards"): rank · avatar · supplier + response time · price.
 * Rendered as the `<li>` itself so the FLIP directive animates the list item directly. Rank, badge and glow are plain
 * bindings — the element is reused across re-orders (`track q.supplier`), only its contents update in place.
 */
@Component({
  selector: 'li[phResultCard]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ph-glass ph-glass--card result-card',
    'data-testid': 'result-card',
    '[attr.data-supplier]': 'quote().supplier',
    '[attr.data-price]': 'quote().price',
    '[class.ph-glow]': 'cheapest()',
    '[class.is-cheapest]': 'cheapest()',
  },
  template: `
    <span class="rank" aria-hidden="true">#{{ rank() }}</span>
    <span class="visually-hidden">Rank {{ rank() }}:</span>
    <span [class]="'ph-avatar avatar ph-supplier-' + quote().supplier" aria-hidden="true">{{ quote().supplier }}</span>
    <span class="who">
      <span class="name-row">
        <span class="name">{{ quote().supplierName }}</span>
        @if (cheapest()) {
          <span class="ph-badge ph-tag--success ph-pulse cheapest" data-testid="cheapest-badge">Cheapest</span>
        }
      </span>
      <span class="ms">{{ responseTime() }}</span>
    </span>
    <span class="price">{{ price() }}</span>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      height: 72px;
      padding: 0 20px;
      list-style: none;
    }
    :host(.is-cheapest) {
      background: linear-gradient(90deg, rgba(45, 212, 191, 0.1), rgba(34, 211, 238, 0.03) 60%), var(--ph-glass-bg);
    }
    .rank {
      flex: none;
      width: 30px;
      color: var(--ph-text-muted);
      font: 600 15px/1 var(--ph-font-display);
      font-variant-numeric: tabular-nums;
    }
    :host(.is-cheapest) .rank {
      color: var(--ph-teal);
    }
    .avatar {
      width: 36px;
      height: 36px;
      font-size: 15px;
    }
    .who {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .name {
      overflow: hidden;
      color: var(--ph-text);
      font-weight: 600;
      font-size: 15px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .cheapest {
      flex: none;
      height: 20px;
      padding: 0 8px;
      font-size: 11px;
    }
    .ms {
      color: var(--ph-text-muted);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .price {
      flex: none;
      margin-left: auto;
      color: var(--ph-text);
      font: 600 22px/1 var(--ph-font-display);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.01em;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    @media (max-width: 599.98px) {
      :host {
        height: 64px;
        gap: 10px;
        padding: 0 14px;
      }
      .rank {
        width: 24px;
        font-size: 14px;
      }
      .avatar {
        width: 32px;
        height: 32px;
        font-size: 14px;
      }
      .name {
        font-size: 14px;
      }
      .ms {
        font-size: 12px;
      }
      /* Narrow card + 22 px price: the Cheapest badge moves next to the response time so the name never truncates. */
      .who {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        column-gap: 8px;
        row-gap: 4px;
      }
      .name-row {
        display: contents;
      }
      .name {
        grid-column: 1 / -1;
      }
      .ms {
        grid-row: 2;
        grid-column: 1;
      }
      .cheapest {
        grid-row: 2;
        grid-column: 2;
        justify-self: start;
        height: 18px;
        padding: 0 7px;
        font-size: 10.5px;
      }
    }
  `,
})
export class ResultCard {
  readonly quote = input.required<QuoteEvent>();
  readonly rank = input.required<number>();

  protected readonly cheapest = computed(() => this.rank() === 1);
  protected readonly price = computed(() => formatPrice(this.quote().price));
  protected readonly responseTime = computed(() => formatResponseMs(this.quote().responseTimeMs));
}
