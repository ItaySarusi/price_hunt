import { ChangeDetectionStrategy, Component, computed, effect, input, output, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { Location, Supplier } from '../../core/api.models';
import { toIsoDate, toLocalDate } from '../../shared/format';
import { LocationAutocomplete, LocationValue, isLocation, locationValidator } from '../../shared/location-autocomplete';
import { HistoryFilters, defaultFilters, normaliseSuppliers, supplierSummary } from './history-url';

/** The part of the History state the filters card edits (sort & paging live on the table). */
export type HistoryFilterValue = Pick<HistoryFilters, 'start' | 'end' | 'suppliers' | 'from' | 'to' | 'failures'>;

function createFiltersForm() {
  return new FormGroup({
    start: new FormControl<Date | null>(null, Validators.required),
    end: new FormControl<Date | null>(null, Validators.required),
    suppliers: new FormControl<string[]>([], { nonNullable: true, validators: Validators.required }),
    from: new FormControl<LocationValue>(null, locationValidator(false)),
    to: new FormControl<LocationValue>(null, locationValidator(false)),
    failures: new FormControl(true, { nonNullable: true }),
  });
}

/**
 * History filters card (SPEC §11.4): shipping-date range, supplier multi-select, optional From/To, Show failures,
 * Apply / Reset. Edits stay local until Apply — the parent turns the emitted value into URL query params, and the
 * URL (via the `filters` input) is the only thing that writes back into this form.
 */
@Component({
  selector: 'ph-history-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    LocationAutocomplete,
  ],
  template: `
    <form
      class="ph-glass card"
      data-testid="history-filters"
      aria-label="History filters"
      [formGroup]="form"
      (ngSubmit)="apply()"
      novalidate
    >
      <mat-form-field class="a-dates" hideRequiredMarker>
        <mat-label>Shipping dates</mat-label>
        <mat-date-range-input [rangePicker]="picker">
          <input matStartDate formControlName="start" placeholder="Start date" aria-label="Start date" />
          <input matEndDate formControlName="end" placeholder="End date" aria-label="End date" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" aria-label="Open calendar" />
        <mat-date-range-picker #picker />
        @if (datesError()) {
          <mat-error>{{ datesError() }}</mat-error>
        } @else {
          <mat-hint>Shows searches whose shipping window overlaps these dates.</mat-hint>
        }
      </mat-form-field>

      <mat-form-field class="a-sup" hideRequiredMarker>
        <mat-label>Suppliers</mat-label>
        <mat-icon matPrefix aria-hidden="true">local_shipping</mat-icon>
        <mat-select multiple formControlName="suppliers" panelClass="ph-supplier-panel" data-testid="supplier-select">
          <mat-select-trigger>{{ supplierText() }}</mat-select-trigger>
          @for (s of suppliers(); track s.code) {
            <mat-option [value]="s.code">
              <span class="opt"><span [class]="'ph-dot ph-supplier-' + s.code" aria-hidden="true"></span>{{ s.name }}</span>
            </mat-option>
          }
        </mat-select>
        @if (suppliersError()) {
          <mat-error>Pick at least one supplier.</mat-error>
        }
      </mat-form-field>

      <ph-location-autocomplete
        class="a-from"
        label="From"
        icon="trip_origin"
        placeholder="Any origin"
        testId="history-from"
        [clearable]="true"
        [control]="form.controls.from"
        [locations]="locations()"
        [error]="fromError()"
      />

      <ph-location-autocomplete
        class="a-to"
        label="To"
        icon="location_on"
        placeholder="Any destination"
        testId="history-to"
        [clearable]="true"
        [control]="form.controls.to"
        [locations]="locations()"
        [error]="toError()"
      />

      <mat-slide-toggle class="a-fail" formControlName="failures" data-testid="failures-toggle">
        Show failures
      </mat-slide-toggle>

      <div class="a-act actions">
        <button type="button" class="ph-btn" data-testid="reset-btn" (click)="reset()">
          <mat-icon aria-hidden="true">restart_alt</mat-icon>Reset
        </button>
        <button type="submit" class="ph-btn ph-btn--primary" data-testid="apply-btn" [disabled]="invalid()">
          <mat-icon aria-hidden="true">filter_alt</mat-icon>Apply
        </button>
      </div>
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        'dates sup from to'
        'fail fail act act';
      gap: 12px 16px;
      align-items: start;
      padding: 20px 24px;
    }
    .a-dates {
      grid-area: dates;
    }
    .a-sup {
      grid-area: sup;
    }
    .a-from {
      grid-area: from;
    }
    .a-to {
      grid-area: to;
    }
    .a-fail {
      grid-area: fail;
      align-self: center;
    }
    .a-act {
      grid-area: act;
    }
    mat-form-field {
      width: 100%;
      min-width: 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .actions .ph-btn {
      min-width: 112px;
    }
    .opt {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    @media (max-width: 1023.98px) {
      .card {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-areas:
          'dates sup'
          'from to'
          'fail act';
      }
    }
    @media (max-width: 599.98px) {
      .card {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: 'dates' 'sup' 'from' 'to' 'fail' 'act';
        padding: 16px;
      }
      .actions .ph-btn {
        flex: 1;
      }
    }
  `,
})
export class HistoryFiltersComponent {
  /** Current applied state (from the URL). Re-syncs the form whenever it changes. */
  readonly filters = input.required<HistoryFilters>();
  readonly locations = input.required<readonly Location[]>();
  readonly suppliers = input.required<readonly Supplier[]>();

  readonly applied = output<HistoryFilterValue>();
  readonly resetRequested = output<void>();

  protected readonly form = createFiltersForm();
  private readonly formEvents = toSignal(this.form.events);

  private readonly allCodes = computed(() => this.suppliers().map((s) => s.code));
  protected readonly supplierText = computed(() => {
    this.formEvents();
    return supplierSummary(this.form.controls.suppliers.value, this.allCodes());
  });
  protected readonly invalid = computed(() => {
    this.formEvents();
    return this.form.invalid;
  });
  protected readonly datesError = computed(() => {
    this.formEvents();
    const { start, end } = this.form.controls;
    if (start.hasError('matStartDateInvalid') || end.hasError('matEndDateInvalid')) return 'Start must be before end.';
    if (start.hasError('matDatepickerParse') || end.hasError('matDatepickerParse')) return 'Enter a valid date.';
    if ((start.touched || end.touched) && (start.hasError('required') || end.hasError('required'))) {
      return 'Pick a start and end date.';
    }
    return null;
  });
  protected readonly suppliersError = computed(() => {
    this.formEvents();
    return this.form.controls.suppliers.hasError('required');
  });
  protected readonly fromError = computed(() => this.locationError('from'));
  protected readonly toError = computed(() => this.locationError('to'));

  constructor() {
    // URL → form. Locations are needed to turn a code back into a picked catalog entry.
    effect(() => {
      const f = this.filters();
      const locations = this.locations();
      untracked(() => this.sync(f, locations));
    });
  }

  protected apply(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (!v.start || !v.end) return;
    this.applied.emit({
      start: toIsoDate(v.start),
      end: toIsoDate(v.end),
      suppliers: normaliseSuppliers(v.suppliers),
      from: isLocation(v.from) ? v.from.code : null,
      to: isLocation(v.to) ? v.to.code : null,
      failures: v.failures,
    });
  }

  protected reset(): void {
    // Reset the form here too: if the URL is already at its defaults, `filters` won't change.
    this.sync(defaultFilters(new Date()), this.locations());
    this.resetRequested.emit();
  }

  private sync(f: HistoryFilters, locations: readonly Location[]): void {
    const find = (code: string | null) => (code ? (locations.find((l) => l.code === code) ?? null) : null);
    this.form.reset({
      start: toLocalDate(f.start),
      end: toLocalDate(f.end),
      suppliers: [...f.suppliers],
      from: find(f.from),
      to: find(f.to),
      failures: f.failures,
    });
  }

  private locationError(key: 'from' | 'to'): string | null {
    this.formEvents();
    const c = this.form.controls[key];
    return c.touched && c.hasError('catalog') ? 'Pick a location from the list.' : null;
  }
}
