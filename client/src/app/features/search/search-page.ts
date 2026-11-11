import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { PageHeader } from '../../shared/page-header';
import { ProgressPanel } from './progress-panel';
import { ResultList } from './result-list';
import { SearchFormComponent } from './search-form';
import { SearchStore } from './search.store';

/** Search screen (SPEC §11.3): form card → progress panel (+ status strip) → error banner → ranked results. */
@Component({
  selector: 'ph-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, SearchFormComponent, ProgressPanel, ResultList, MatIconModule],
  template: `
    <ph-page-header title="Find the best shipping price" subtitle="Live quotes from up to 7 suppliers" />

    <ph-search-form />

    <ph-progress-panel />

    @if (store.problem(); as p) {
      <div class="ph-glass banner" role="alert" data-testid="search-error">
        <mat-icon class="banner__icon" aria-hidden="true">error</mat-icon>
        <div class="banner__body">
          <p class="banner__title">{{ p.title }}</p>
          @if (p.messages.length) {
            <ul class="banner__list">
              @for (m of p.messages; track $index) {
                <li>{{ m }}</li>
              }
            </ul>
          }
        </div>
      </div>
    }

    <ph-result-list />
  `,
  styles: `
    :host {
      display: block;
    }
    .banner {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-top: 20px;
      padding: 14px 18px;
      border-color: rgba(248, 113, 113, 0.4);
      background: linear-gradient(rgba(248, 113, 113, 0.14), rgba(248, 113, 113, 0.14)), var(--ph-glass-bg);
    }
    .banner__icon {
      flex: none;
      color: var(--ph-danger);
    }
    .banner__title {
      margin: 0;
      font-weight: 600;
      color: var(--ph-text);
    }
    .banner__list {
      margin: 4px 0 0;
      padding-left: 18px;
      color: var(--ph-text);
    }
  `,
})
export default class SearchPage {
  protected readonly store = inject(SearchStore);
}
