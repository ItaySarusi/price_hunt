import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'search' },
  { path: 'search', title: 'Search · PriceHunt', loadComponent: () => import('./features/search/search-page') },
  { path: 'history', title: 'History · PriceHunt', loadComponent: () => import('./features/history/history-page') },
  { path: '**', redirectTo: 'search' },
];
