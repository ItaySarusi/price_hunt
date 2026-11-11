import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { NEVER, of } from 'rxjs';

import { Location, Supplier } from '../../core/api.models';
import { MetaService } from '../../core/meta.service';
import { SearchStreamService } from '../../core/search-stream.service';
import { SearchForm as SearchFormGroup, MSG } from './search-form.validation';
import { SearchFormComponent } from './search-form';
import { SearchStore } from './search.store';

const LOCATIONS: Location[] = [
  { code: 'CNSHA', name: 'Shanghai', countryCode: 'CN', label: 'Shanghai, CN' },
  { code: 'USLAX', name: 'Los Angeles', countryCode: 'US', label: 'Los Angeles, US' },
  { code: 'NLRTM', name: 'Rotterdam', countryCode: 'NL', label: 'Rotterdam, NL' },
];
const SUPPLIERS: Supplier[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ code: c, name: `Supplier ${c}` }));

const day = (offset: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
};

describe('SearchFormComponent', () => {
  let fixture: ComponentFixture<SearchFormComponent>;
  let store: SearchStore;
  let el: HTMLElement;
  let form: SearchFormGroup;

  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const byTestId = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = () => el.textContent ?? '';
  const searchBtn = () => byTestId('search-btn') as HTMLButtonElement;

  const fillValid = () => {
    form.patchValue({ from: LOCATIONS[0], to: LOCATIONS[1], start: day(7), end: day(14) });
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SearchFormComponent],
      providers: [
        provideNativeDateAdapter(),
        { provide: MetaService, useValue: { locations: () => of(LOCATIONS), suppliers: () => of(SUPPLIERS) } },
        { provide: SearchStreamService, useValue: { stream: () => NEVER } },
      ],
    });
    store = TestBed.inject(SearchStore);
    fixture = TestBed.createComponent(SearchFormComponent);
    el = fixture.nativeElement;
    await render();
    form = (fixture.componentInstance as unknown as { form: SearchFormGroup }).form;
  });

  it('selects all 7 suppliers by default', () => {
    expect(form.controls.suppliers.value).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    for (const s of SUPPLIERS) {
      expect(byTestId(`supplier-chip-${s.code}`)?.getAttribute('class')).toContain('mat-mdc-chip-selected');
    }
  });

  it('disables Search while the form is invalid and shows no message before touch', async () => {
    expect(searchBtn().disabled).toBe(true);
    expect(text()).not.toContain(MSG.location);
    fillValid();
    await render();
    expect(searchBtn().disabled).toBe(false);
  });

  it('shows "Choose a location from the list" for typed text that is not a catalog entry', async () => {
    form.controls.from.setValue('Shang');
    form.controls.from.markAsTouched();
    await render();
    expect(text()).toContain(MSG.location);
    form.controls.from.setValue(LOCATIONS[0]);
    await render();
    expect(text()).not.toContain(MSG.location);
  });

  it('shows "Choose a location from the list" for an empty required field after touch', async () => {
    form.controls.to.markAsTouched();
    await render();
    expect(text()).toContain(MSG.location);
  });

  it('shows "From and To must be different" when both are the same location', async () => {
    fillValid();
    form.patchValue({ to: LOCATIONS[0] });
    form.controls.to.markAsTouched();
    await render();
    expect(text()).toContain(MSG.sameRoute);
    expect(searchBtn().disabled).toBe(true);
  });

  it(`shows "Dates can't be in the past" for a start date before today`, async () => {
    fillValid();
    form.patchValue({ start: day(-1) });
    form.controls.start.markAsTouched();
    await render();
    expect(text()).toContain(MSG.past);
    expect(searchBtn().disabled).toBe(true);
  });

  it('shows "End date must be on or after start date" when end < start', async () => {
    fillValid();
    form.patchValue({ start: day(10), end: day(5) });
    form.controls.end.markAsTouched();
    await render();
    expect(text()).toContain(MSG.order);
    expect(text()).not.toContain(MSG.past);
    expect(searchBtn().disabled).toBe(true);
  });

  it('accepts a same-day range starting today', async () => {
    fillValid();
    form.patchValue({ start: day(0), end: day(0) });
    form.markAllAsTouched();
    await render();
    expect(text()).not.toContain(MSG.past);
    expect(text()).not.toContain(MSG.order);
    expect(searchBtn().disabled).toBe(false);
  });

  it('Clear deselects every supplier and shows "Select at least one supplier"; Select all restores', async () => {
    fillValid();
    byTestId('clear-all')!.click();
    await render();
    expect(form.controls.suppliers.value).toEqual([]);
    expect(text()).toContain(MSG.noSupplier);
    expect(searchBtn().disabled).toBe(true);

    byTestId('select-all')!.click();
    await render();
    expect(form.controls.suppliers.value).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(text()).not.toContain(MSG.noSupplier);
    expect(searchBtn().disabled).toBe(false);
  });

  it('swap exchanges From and To', async () => {
    fillValid();
    byTestId('swap-btn')!.click();
    await render();
    expect(form.controls.from.value).toEqual(LOCATIONS[1]);
    expect(form.controls.to.value).toEqual(LOCATIONS[0]);
  });

  it('shows every message after a submit attempt without touching anything', async () => {
    form.controls.suppliers.setValue([]);
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    await render();
    expect(text()).toContain(MSG.location);
    expect(text()).toContain(MSG.datesMissing);
    expect(text()).toContain(MSG.noSupplier);
  });

  it('submitting calls store.search with yyyy-MM-dd from LOCAL dates and the selected codes in A→G order', async () => {
    const spy = vi.spyOn(store, 'search');
    // 00:30 local time: toISOString() would give the previous day in UTC+ zones.
    form.patchValue({
      from: LOCATIONS[0],
      to: LOCATIONS[1],
      start: new Date(2099, 0, 5, 0, 30),
      end: new Date(2099, 0, 9, 0, 30),
      suppliers: ['E', 'A', 'C'],
    });
    await render();
    searchBtn().click();
    await render();
    expect(spy).toHaveBeenCalledWith({
      fromLocation: 'CNSHA',
      toLocation: 'USLAX',
      fromDate: '2099-01-05',
      toDate: '2099-01-09',
      suppliers: ['A', 'C', 'E'],
    });
  });

  it('does not call store.search while invalid', async () => {
    const spy = vi.spyOn(store, 'search');
    (fixture.componentInstance as unknown as { submit(): void }).submit();
    await render();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows Cancel only while a search is running; Cancel calls store.cancel; Search stays enabled', async () => {
    expect(byTestId('cancel-btn')).toBeNull();
    fillValid();
    await render();
    searchBtn().click();
    await render();
    expect(store.running()).toBe(true);
    expect(byTestId('cancel-btn')).not.toBeNull();
    expect(searchBtn().disabled).toBe(false);

    const cancel = vi.spyOn(store, 'cancel');
    byTestId('cancel-btn')!.click();
    await render();
    expect(cancel).toHaveBeenCalled();
    expect(byTestId('cancel-btn')).toBeNull();
  });

  it('persists the form value to the store and restores it on a new instance', async () => {
    fillValid();
    form.controls.suppliers.setValue(['B', 'D']);
    await render();
    expect(store.formValue()).toEqual(
      expect.objectContaining({ from: 'CNSHA', to: 'USLAX', suppliers: ['B', 'D'] }),
    );

    fixture.destroy();
    const again = TestBed.createComponent(SearchFormComponent);
    again.detectChanges();
    await again.whenStable();
    const f2 = (again.componentInstance as unknown as { form: SearchFormGroup }).form;
    expect(f2.controls.from.value).toEqual(LOCATIONS[0]);
    expect(f2.controls.to.value).toEqual(LOCATIONS[1]);
    expect(f2.controls.suppliers.value).toEqual(['B', 'D']);
    expect(f2.controls.start.value?.getTime()).toBe(day(7).getTime());
  });

  const floated = (root: HTMLElement) =>
    [...root.querySelectorAll('mat-form-field')].map((f) => [
      f.querySelector('mat-label')?.textContent?.trim(),
      !!f.querySelector('.mdc-floating-label--float-above'),
    ]);

  it('a form restored from the store is valid, enables Search and floats every label', async () => {
    store.setFormValue({ from: 'CNSHA', to: 'USLAX', start: day(7), end: day(14), suppliers: ['A', 'C'] });
    fixture.destroy();
    const again = TestBed.createComponent(SearchFormComponent);
    again.detectChanges();
    await again.whenStable();
    again.detectChanges();
    const root: HTMLElement = again.nativeElement;
    expect((root.querySelector('[data-testid="search-btn"]') as HTMLButtonElement).disabled).toBe(false);
    expect(floated(root)).toEqual([
      ['From', true],
      ['To', true],
      ['Shipping dates', true],
    ]);
    expect((root.querySelector('[data-testid="to-input"]') as HTMLInputElement).value).toBe('Los Angeles, US');
  });

  it('labels stay floated with values after swap and after programmatic fill', async () => {
    fillValid();
    await render();
    expect(floated(el).every(([, f]) => f)).toBe(true);
    byTestId('swap-btn')!.click();
    await render();
    expect(floated(el).every(([, f]) => f)).toBe(true);
    expect((byTestId('from-input') as HTMLInputElement).value).toBe('Los Angeles, US');
    expect((byTestId('to-input') as HTMLInputElement).value).toBe('Shanghai, CN');
    expect(searchBtn().disabled).toBe(false);
  });
});
