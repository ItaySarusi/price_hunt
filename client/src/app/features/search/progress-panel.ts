import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { formatCountdown, formatSearchSummary } from '../../shared/format';
import { SearchStatus, SearchStore } from './search.store';
import { SupplierStatusStrip } from './supplier-status-strip';

interface Badge {
  label: string;
  icon: string;
  tone: string;
}

/** Final badge per end state; Completed/TimedOut come from the server's `end` event (SPEC §11.3). */
const BADGES: Partial<Record<SearchStatus, Badge>> = {
  Completed: { label: 'Completed', icon: 'check_circle', tone: 'ph-tag--success' },
  TimedOut: { label: 'Timed out', icon: 'timer_off', tone: 'ph-tag--warning' },
  Cancelled: { label: 'Cancelled', icon: 'block', tone: 'ph-tag--neutral' },
  ConnectionLost: { label: 'Connection lost', icon: 'cloud_off', tone: 'ph-tag--danger' },
};

const TICK_MS = 100;

/** Progress panel (SPEC §11.3): live counter, cosmetic countdown, determinate bar, final badge, summary, status strip. */
@Component({
  selector: 'ph-progress-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressBarModule, SupplierStatusStrip],
  template: `
    @if (store.status() !== 'idle') {
      <section class="ph-glass panel" aria-label="Search progress">
        <div class="head">
          <p class="counter" data-testid="progress-text" aria-live="polite">
            <strong class="num">{{ store.responded() }}</strong> of
            <span class="num">{{ store.total() }}</span> suppliers responded
          </p>
          <div class="state">
            @if (store.running()) {
              @if (countdown(); as c) {
                <span class="countdown" data-testid="countdown">{{ c }}</span>
              }
            }
            <span aria-live="polite">
              @if (badge(); as b) {
                <span class="ph-badge final" [class]="b.tone" data-testid="final-badge">
                  <mat-icon aria-hidden="true">{{ b.icon }}</mat-icon>{{ b.label }}
                </span>
              }
            </span>
          </div>
        </div>

        <div class="ph-progress" [class.is-running]="store.running()">
          <mat-progress-bar mode="determinate" [value]="percent()" aria-label="Suppliers responded" />
        </div>

        <!-- Always one line (waiting hint while running, summary after the end) so the strip below never shifts. -->
        @if (waiting(); as w) {
          <p class="summary" data-testid="progress-waiting">{{ w }}</p>
        } @else {
          <p class="summary" [attr.data-testid]="summary() ? 'progress-summary' : null">{{ summary() }}</p>
        }

        <ph-supplier-status-strip class="strip" />
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .panel {
      margin-top: 20px;
      padding: 18px 20px 20px;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      min-height: 28px;
      margin-bottom: 14px;
    }
    .counter {
      margin: 0;
      color: var(--ph-text);
      font-size: 15px;
      font-weight: 500;
    }
    .num {
      font-family: var(--ph-font-display);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    strong.num {
      color: var(--ph-teal);
      font-size: 20px;
    }
    .state {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .countdown {
      color: var(--ph-text-muted);
      font-family: var(--ph-font-display);
      font-size: 14px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .final {
      height: 28px;
      padding: 0 12px;
      font-size: 13px;
    }
    .summary {
      min-height: 1.5em;
      margin: 12px 0 0;
      line-height: 1.5;
      color: var(--ph-text-muted);
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    .strip {
      margin-top: 16px;
    }
    /* Phones: the countdown/badge gets its own fixed-height row, so swapping one for the other never re-wraps the
       header and nothing below the panel shifts when the search ends. */
    @media (max-width: 599.98px) {
      .panel {
        padding: 16px;
      }
      .head {
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      .state {
        min-height: 28px;
      }
    }
  `,
})
export class ProgressPanel {
  protected readonly store = inject(SearchStore);

  /** Client clock, ticked every 100 ms only while a search is running (cosmetic countdown). */
  private readonly now = signal(Date.now());

  protected readonly countdown = computed(() => {
    const startedAt = this.store.startedAt();
    if (startedAt === null) return null;
    // `now` may lag `startedAt` by up to one tick; never show more than the full timeout.
    const elapsed = Math.max(0, this.now() - startedAt);
    return formatCountdown(this.store.timeoutMs() - elapsed);
  });

  protected readonly percent = computed(() => {
    const total = this.store.total();
    return total > 0 ? Math.round((this.store.responded() / total) * 100) : 0;
  });

  protected readonly badge = computed(() => BADGES[this.store.status()] ?? null);

  protected readonly summary = computed(() =>
    this.badge()
      ? formatSearchSummary({
          succeeded: this.store.succeeded(),
          failed: this.store.failed(),
          noResponse: this.store.noResponse(),
          cancelled: this.store.cancelled(),
        })
      : null,
  );

  /** Muted hint in the summary line while the search runs ("Waiting for 3 suppliers…"). */
  protected readonly waiting = computed(() => {
    if (!this.store.running()) return null;
    const left = this.store.total() - this.store.responded();
    return left > 0 ? `Waiting for ${left} supplier${left === 1 ? '' : 's'}…` : null;
  });

  constructor() {
    // The interval exists only while a search runs; effect cleanup clears it on end, new search or destroy.
    effect((onCleanup) => {
      if (!this.store.running()) return;
      this.now.set(Date.now());
      const id = setInterval(() => this.now.set(Date.now()), TICK_MS);
      onCleanup(() => clearInterval(id));
    });
  }
}
