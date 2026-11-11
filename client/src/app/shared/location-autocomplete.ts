import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { Location } from '../core/api.models';

/** A catalog entry once picked, the raw text while the user is typing, or nothing. */
export type LocationValue = Location | string | null;

export const isLocation = (v: unknown): v is Location =>
  typeof v === 'object' && v !== null && typeof (v as Location).code === 'string';

/**
 * Catalog validator (SPEC §11.3): typed text that isn't a picked catalog entry → `{ catalog: true }`.
 * Empty → `{ required: true }` when `required`, otherwise valid (History filters are optional).
 */
export function locationValidator(required: boolean): ValidatorFn {
  return (c: AbstractControl<LocationValue>): ValidationErrors | null => {
    const v = c.value;
    if (v == null || (typeof v === 'string' && v.trim() === '')) return required ? { required: true } : null;
    return isLocation(v) ? null : { catalog: true };
  };
}

/** Case-insensitive "contains" on label or code. */
export function filterLocations(all: readonly Location[], query: string): readonly Location[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((l) => l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
}

/**
 * From/To location picker over the catalog (`mat-autocomplete`). Used by Search and History (with `clearable`).
 * The parent owns the FormControl and decides when an error message is shown (`error` input).
 */
@Component({
  selector: 'ph-location-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <mat-form-field class="field">
      <mat-label>{{ label() }}</mat-label>
      <mat-icon matPrefix aria-hidden="true">{{ icon() }}</mat-icon>
      <input
        matInput
        [formControl]="control()"
        [matAutocomplete]="auto"
        [placeholder]="placeholder()"
        [errorStateMatcher]="matcher"
        [attr.data-testid]="testId() || null"
        autocomplete="off"
        spellcheck="false"
        (input)="onInput($event)"
        (focus)="onFocus($event)"
        (blur)="resolveExact()"
      />
      @if (clearable() && control().value) {
        <button
          matSuffix
          type="button"
          class="clear"
          [attr.aria-label]="'Clear ' + label()"
          [attr.data-testid]="testId() ? testId() + '-clear' : null"
          (click)="clear()"
        >
          <mat-icon aria-hidden="true">close</mat-icon>
        </button>
      }
      <mat-autocomplete
        #auto="matAutocomplete"
        autoActiveFirstOption
        [displayWith]="display"
        (optionSelected)="query.set('')"
      >
        @for (l of filtered(); track l.code) {
          <mat-option [value]="l">
            <span class="opt">
              <span class="opt__label">{{ l.label }}</span>
              <span class="opt__code">{{ l.code }}</span>
            </span>
          </mat-option>
        } @empty {
          @if (query()) {
            <mat-option disabled class="opt--empty">No matching location</mat-option>
          }
        }
      </mat-autocomplete>
      @if (error()) {
        <mat-error>{{ error() }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .field {
      width: 100%;
    }
    .opt {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
    }
    .opt__code {
      color: var(--ph-text-muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.04em;
    }
    .clear {
      display: inline-grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-right: 4px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--ph-text-muted);
      cursor: pointer;
    }
    .clear:hover {
      color: var(--ph-text);
      background: rgba(255, 255, 255, 0.06);
    }
  `,
})
export class LocationAutocomplete {
  readonly control = input.required<FormControl<LocationValue>>();
  readonly locations = input.required<readonly Location[]>();
  readonly label = input.required<string>();
  readonly icon = input('location_on');
  readonly placeholder = input('City or port code');
  readonly testId = input('');
  readonly clearable = input(false);
  /** Message to show under the field; null/empty = no error state. The parent decides when (touch/submit). */
  readonly error = input<string | null>(null);

  protected readonly query = signal('');
  protected readonly filtered = computed(() => filterLocations(this.locations(), this.query()));
  protected readonly matcher: ErrorStateMatcher = { isErrorState: () => !!this.error() };
  protected readonly display = (v: LocationValue): string => (isLocation(v) ? v.label : (v ?? ''));

  protected onInput(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
  }

  /**
   * On focus: with a valid catalog pick (input shows its label) open the full list; otherwise keep filtering by
   * whatever text is still in the input.
   */
  protected onFocus(e: Event): void {
    const text = (e.target as HTMLInputElement).value;
    const v = this.control().value;
    this.query.set(isLocation(v) && text === v.label ? '' : text);
  }

  /** Typing an exact label or code and leaving the field counts as picking that entry. */
  protected resolveExact(): void {
    const v = this.control().value;
    if (typeof v !== 'string' || !v.trim()) return;
    const q = v.trim().toLowerCase();
    const hit = this.locations().find((l) => l.label.toLowerCase() === q || l.code.toLowerCase() === q);
    if (hit) this.control().setValue(hit);
  }

  protected clear(): void {
    this.control().setValue(null);
    this.control().markAsTouched();
    this.query.set('');
  }
}
