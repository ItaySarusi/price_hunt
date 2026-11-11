import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatChipsModule } from '@angular/material/chips';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { combineLatest, take } from 'rxjs';

import { Location, SearchRequest, Supplier } from '../../core/api.models';
import { MetaService } from '../../core/meta.service';
import { toIsoDate } from '../../shared/format';
import { LocationAutocomplete, isLocation } from '../../shared/location-autocomplete';
import { createSearchForm, formMessages, today } from './search-form.validation';
import { SearchStore } from './search.store';

interface Catalog {
  locations: readonly Location[];
  suppliers: readonly Supplier[];
}

/**
 * Search form card (SPEC §11.3 "Form card"): From ⇄ To autocompletes, date range (min today), supplier chips,
 * Search / Cancel. The form value lives in the root SearchStore so it survives tab switches.
 */
@Component({
  selector: 'ph-search-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    LocationAutocomplete,
  ],
  templateUrl: './search-form.html',
  styleUrl: './search-form.scss',
})
export class SearchFormComponent {
  private readonly meta = inject(MetaService);
  private readonly store = inject(SearchStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly form = createSearchForm();
  protected readonly minDate = today();
  protected readonly catalog = signal<Catalog | null>(null);
  protected readonly loadError = signal(false);
  protected readonly running = this.store.running;

  private readonly submitted = signal(false);
  /** Re-evaluates the computeds below on every value/status/touched change of the form. */
  private readonly formEvents = toSignal(this.form.events);

  protected readonly messages = computed(() => {
    this.formEvents();
    return formMessages(this.form, this.submitted());
  });
  protected readonly invalid = computed(() => {
    this.formEvents();
    return this.form.invalid;
  });
  protected readonly selectedCount = computed(() => {
    this.formEvents();
    return this.form.controls.suppliers.value.length;
  });
  protected readonly datesMatcher: ErrorStateMatcher = { isErrorState: () => !!this.messages().dates };

  constructor() {
    combineLatest({ locations: this.meta.locations(), suppliers: this.meta.suppliers() })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalog) => {
          this.restore(catalog);
          this.catalog.set(catalog);
          this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.persist());
        },
        error: () => this.loadError.set(true),
      });
  }

  protected swap(): void {
    const { from, to } = this.form.getRawValue();
    this.form.patchValue({ from: to, to: from });
  }

  protected selectAll(): void {
    const s = this.form.controls.suppliers;
    s.setValue(this.allCodes());
    s.markAsTouched();
  }

  protected clearAll(): void {
    const s = this.form.controls.suppliers;
    s.setValue([]);
    s.markAsTouched();
  }

  protected submit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    if (!isLocation(v.from) || !isLocation(v.to) || !v.start || !v.end) return;
    const req: SearchRequest = {
      fromLocation: v.from.code,
      toLocation: v.to.code,
      fromDate: toIsoDate(v.start),
      toDate: toIsoDate(v.end),
      suppliers: this.allCodes().filter((c) => v.suppliers.includes(c)),
    };
    this.store.search(req);
  }

  protected cancel(): void {
    this.store.cancel();
  }

  private allCodes(): string[] {
    return (this.catalog()?.suppliers ?? []).map((s) => s.code);
  }

  private restore(catalog: Catalog): void {
    const saved = this.store.formValue();
    const find = (code: string | null) => catalog.locations.find((l) => l.code === code) ?? null;
    this.form.setValue(
      {
        from: find(saved.from),
        to: find(saved.to),
        start: saved.start,
        end: saved.end,
        suppliers: saved.suppliers ?? catalog.suppliers.map((s) => s.code),
      },
      { emitEvent: false },
    );
    this.form.updateValueAndValidity();
  }

  private persist(): void {
    const v = this.form.getRawValue();
    this.store.setFormValue({
      from: isLocation(v.from) ? v.from.code : null,
      to: isLocation(v.to) ? v.to.code : null,
      start: v.start,
      end: v.end,
      suppliers: v.suppliers,
    });
  }
}
