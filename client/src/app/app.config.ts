import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideNativeDateAdapter, MAT_DATE_LOCALE, MatDateFormats } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

/** Native date adapter, en-US, displayed as `MMM d, y` ("Nov 9, 2026") — SPEC §11.1 "Formatting". */
export const PH_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: null, timeInput: null },
  display: {
    dateInput: { year: 'numeric', month: 'short', day: 'numeric' },
    timeInput: { hour: 'numeric', minute: 'numeric' },
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' },
    timeOptionLabel: { hour: 'numeric', minute: 'numeric' },
  },
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideNativeDateAdapter(PH_DATE_FORMATS),
    { provide: MAT_DATE_LOCALE, useValue: 'en-US' },
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'fill', subscriptSizing: 'dynamic' } },
  ],
};
