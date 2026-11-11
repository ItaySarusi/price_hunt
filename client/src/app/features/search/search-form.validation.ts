import { AbstractControl, FormControl, FormGroup, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

import { LocationValue, isLocation, locationValidator } from '../../shared/location-autocomplete';

/** Exact user-facing messages (SPEC §11.3 "Strict validation"). */
export const MSG = {
  location: 'Choose a location from the list',
  sameRoute: 'From and To must be different',
  past: "Dates can't be in the past",
  order: 'End date must be on or after start date',
  noSupplier: 'Select at least one supplier',
  /** Not in the SPEC list (dates missing / unparseable) — see DECISIONS.md T2.4. */
  datesMissing: 'Choose a start and end date',
} as const;

export type SearchForm = FormGroup<{
  from: FormControl<LocationValue>;
  to: FormControl<LocationValue>;
  start: FormControl<Date | null>;
  end: FormControl<Date | null>;
  suppliers: FormControl<string[]>;
}>;

const dayNumber = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Local midnight today. */
export const today = (): Date => new Date(dayNumber(new Date()));

const atLeastOne: ValidatorFn = (c: AbstractControl<string[]>) => (c.value?.length ? null : { noSupplier: true });

/** Group rules: From ≠ To; dates not in the past; end ≥ start. */
const groupRules: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const { from, to, start, end } = (g as SearchForm).getRawValue();
  const errors: ValidationErrors = {};
  if (isLocation(from) && isLocation(to) && from.code === to.code) errors['sameRoute'] = true;
  const min = dayNumber(today());
  if ((start && dayNumber(start) < min) || (end && dayNumber(end) < min)) errors['past'] = true;
  if (start && end && dayNumber(end) < dayNumber(start)) errors['order'] = true;
  return Object.keys(errors).length ? errors : null;
};

export function createSearchForm(): SearchForm {
  return new FormGroup(
    {
      from: new FormControl<LocationValue>(null, locationValidator(true)),
      to: new FormControl<LocationValue>(null, locationValidator(true)),
      start: new FormControl<Date | null>(null, Validators.required),
      end: new FormControl<Date | null>(null, Validators.required),
      suppliers: new FormControl<string[]>([], { nonNullable: true, validators: atLeastOne }),
    },
    { validators: groupRules },
  );
}

export interface SearchFormMessages {
  from: string | null;
  to: string | null;
  dates: string | null;
  suppliers: string | null;
}

/**
 * The message for each field, or null. A message is only returned once its field was touched or a submit was
 * attempted (`submitted`). Material's own datepicker errors (min, parse, range order) map onto the same texts.
 */
export function formMessages(form: SearchForm, submitted: boolean): SearchFormMessages {
  const c = form.controls;
  const show = (...ctrls: AbstractControl[]) => submitted || ctrls.some((x) => x.touched);
  const has = (ctrl: AbstractControl, ...keys: string[]) => keys.some((k) => ctrl.hasError(k));

  const loc = (ctrl: AbstractControl) => (has(ctrl, 'required', 'catalog') ? MSG.location : null);

  let dates: string | null = null;
  if (!c.start.value || !c.end.value || has(c.start, 'matDatepickerParse') || has(c.end, 'matDatepickerParse')) {
    dates = MSG.datesMissing;
  } else if (form.hasError('past') || has(c.start, 'matDatepickerMin') || has(c.end, 'matDatepickerMin')) {
    dates = MSG.past;
  } else if (form.hasError('order') || has(c.start, 'matStartDateInvalid') || has(c.end, 'matEndDateInvalid')) {
    dates = MSG.order;
  }

  return {
    from: show(c.from) ? loc(c.from) : null,
    to: show(c.to) ? (loc(c.to) ?? (form.hasError('sameRoute') ? MSG.sameRoute : null)) : null,
    dates: show(c.start, c.end) ? dates : null,
    suppliers: show(c.suppliers) && c.suppliers.hasError('noSupplier') ? MSG.noSupplier : null,
  };
}
