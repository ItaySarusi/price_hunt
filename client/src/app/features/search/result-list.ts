import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { MatIconModule } from '@angular/material/icon';

import { FlipListDirective } from '../../shared/flip-list.directive';
import { ResultCard } from './result-card';
import { SearchStore } from './search.store';

/**
 * Ranked result cards (SPEC §11.3): always sorted (store binary-inserts), DOM nodes reused (`track q.supplier`),
 * re-orders slide via the FLIP directive. States: empty (before the first search), 3 shimmer skeletons (running, no
 * quotes yet), "no price" message (finished without quotes).
 */
@Component({
  selector: 'ph-result-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlipListDirective, MatIconModule, ResultCard],
  template: `
    <section class="results" aria-label="Results">
      @switch (state()) {
        @case ('empty') {
          <div class="message" data-testid="results-empty">
            <span class="message__icon" aria-hidden="true"><mat-icon>travel_explore</mat-icon></span>
            <p>Pick a route and dates to compare up to 7 suppliers.</p>
          </div>
        }
        @case ('loading') {
          <div class="list" aria-hidden="true">
            @for (i of skeletons; track i) {
              <div class="ph-glass ph-glass--card ph-glass--flat skeleton" data-testid="result-skeleton">
                <span class="ph-skeleton sk-rank"></span>
                <span class="ph-skeleton sk-avatar"></span>
                <span class="sk-who">
                  <span class="ph-skeleton sk-name"></span>
                  <span class="ph-skeleton sk-ms"></span>
                </span>
                <span class="ph-skeleton sk-price"></span>
              </div>
            }
          </div>
        }
        @case ('none') {
          <div class="message" data-testid="results-none">
            <span class="message__icon" aria-hidden="true"><mat-icon>search_off</mat-icon></span>
            <p>No supplier returned a price this time. Try again.</p>
          </div>
        }
      }

      <ol class="list" [phFlipList]="quotes()" aria-label="Quotes, cheapest first">
        @for (q of quotes(); track q.supplier; let i = $index) {
          <li phResultCard [quote]="q" [rank]="i + 1"></li>
        }
      </ol>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-top: 24px;
    }
    .list {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-auto-rows: 72px;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    ol.list:empty {
      display: none;
    }
    .message {
      display: grid;
      justify-items: center;
      gap: 14px;
      padding: 36px 16px;
      text-align: center;
      color: var(--ph-text-muted);

      p {
        margin: 0;
        max-width: 46ch;
        text-wrap: balance;
      }
    }
    .message__icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 50%;
      background: var(--ph-neu-surface);
      box-shadow: var(--ph-neu-inset);
      color: var(--ph-teal);

      .mat-icon {
        width: 26px;
        height: 26px;
        font-size: 26px;
      }
    }
    .skeleton {
      display: flex;
      align-items: center;
      gap: 14px;
      height: 72px;
      padding: 0 20px;
    }
    .sk-rank {
      width: 26px;
      height: 14px;
    }
    .sk-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }
    .sk-who {
      display: grid;
      gap: 8px;
    }
    .sk-name {
      width: 120px;
      height: 13px;
    }
    .sk-ms {
      width: 56px;
      height: 10px;
    }
    .sk-price {
      width: 96px;
      height: 20px;
      margin-left: auto;
    }
    @media (max-width: 599.98px) {
      .list {
        grid-auto-rows: 64px;
      }
      .skeleton {
        height: 64px;
        gap: 10px;
        padding: 0 14px;
      }
      .sk-avatar {
        width: 32px;
        height: 32px;
      }
      .sk-name {
        width: 96px;
      }
      .sk-price {
        width: 80px;
      }
    }
  `,
})
export class ResultList {
  private readonly store = inject(SearchStore);

  protected readonly quotes = this.store.quotes;
  protected readonly skeletons = [0, 1, 2];

  protected readonly state = computed<'empty' | 'loading' | 'none' | 'results'>(() => {
    const status = this.store.status();
    if (this.store.quotes().length > 0) return 'results';
    if (status === 'idle') return this.store.problem() ? 'results' : 'empty';
    return status === 'running' ? 'loading' : 'none';
  });
}
