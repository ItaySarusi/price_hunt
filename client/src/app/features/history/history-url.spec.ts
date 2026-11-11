import { convertToParamMap } from '@angular/router';

import {
  ALL_SUPPLIERS,
  HistoryFilters,
  defaultFilters,
  filtersFromParams,
  paramsFromFilters,
  supplierSummary,
  toHistoryQuery,
} from './history-url';

// Fixed "today" so the defaults are deterministic: Nov 9, 2026 (local) → default end Dec 9, 2026.
const TODAY = new Date(2026, 10, 9);

const defaults = (): HistoryFilters => defaultFilters(TODAY);

describe('history-url', () => {
  describe('defaultFilters', () => {
    it('is today → today + 30, all suppliers, no locations, failures on, date asc, page 1, size 25', () => {
      expect(defaults()).toEqual({
        start: '2026-11-09',
        end: '2026-12-09',
        suppliers: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        from: null,
        to: null,
        failures: true,
        sort: 'date',
        dir: 'asc',
        page: 1,
        size: 25,
      });
    });

    it('crosses month/year boundaries using local dates', () => {
      expect(defaultFilters(new Date(2026, 11, 20))).toMatchObject({ start: '2026-12-20', end: '2027-01-19' });
    });
  });

  describe('paramsFromFilters', () => {
    it('omits every param that equals its default', () => {
      expect(paramsFromFilters(defaults(), TODAY)).toEqual({});
    });

    it('writes only the non-default params, in the SPEC format', () => {
      const f: HistoryFilters = {
        ...defaults(),
        start: '2026-11-01',
        suppliers: ['A', 'B'],
        from: 'CNSHA',
        to: 'USLAX',
        failures: false,
        sort: 'price',
        dir: 'desc',
        page: 3,
        size: 50,
      };
      expect(paramsFromFilters(f, TODAY)).toEqual({
        start: '2026-11-01',
        suppliers: 'A,B',
        from: 'CNSHA',
        to: 'USLAX',
        failures: '0',
        sort: 'price',
        dir: 'desc',
        page: '3',
        size: '50',
      });
    });

    it('serializes suppliers comma-separated in A→G order regardless of selection order', () => {
      const f = { ...defaults(), suppliers: ['G', 'C', 'A'] };
      expect(paramsFromFilters(f, TODAY)).toEqual({ suppliers: 'A,C,G' });
    });

    it('treats all suppliers in any order as the default (omitted)', () => {
      const f = { ...defaults(), suppliers: ['G', 'F', 'E', 'D', 'C', 'B', 'A'] };
      expect(paramsFromFilters(f, TODAY)).toEqual({});
    });
  });

  describe('filtersFromParams', () => {
    it('empty params → defaults', () => {
      expect(filtersFromParams(convertToParamMap({}), TODAY)).toEqual(defaults());
    });

    it('accepts a plain Params object as well as a ParamMap', () => {
      expect(filtersFromParams({ sort: 'route' }, TODAY)).toEqual({ ...defaults(), sort: 'route' });
    });

    it('fills missing params from defaults (partial params)', () => {
      const f = filtersFromParams(convertToParamMap({ to: 'USLAX', page: '2' }), TODAY);
      expect(f).toEqual({ ...defaults(), to: 'USLAX', page: 2 });
    });

    it('parses failures=0 as failures off and failures=1 as on', () => {
      expect(filtersFromParams({ failures: '0' }, TODAY).failures).toBe(false);
      expect(filtersFromParams({ failures: '1' }, TODAY).failures).toBe(true);
    });

    it('parses suppliers and normalises them to A→G order', () => {
      expect(filtersFromParams({ suppliers: 'C,A' }, TODAY).suppliers).toEqual(['A', 'C']);
    });

    it('accepts every sort column and both directions', () => {
      for (const sort of ['date', 'route', 'supplier', 'price', 'responseTime', 'status'] as const) {
        expect(filtersFromParams({ sort, dir: 'desc' }, TODAY)).toMatchObject({ sort, dir: 'desc' });
      }
    });

    it.each([
      ['start', 'yesterday', 'start', '2026-11-09'],
      ['start', '2026-02-30', 'start', '2026-11-09'],
      ['end', '12/09/2026', 'end', '2026-12-09'],
      ['sort', 'bogus', 'sort', 'date'],
      ['dir', 'up', 'dir', 'asc'],
      ['page', '0', 'page', 1],
      ['page', '-2', 'page', 1],
      ['page', '1.5', 'page', 1],
      ['page', 'abc', 'page', 1],
      ['size', '30', 'size', 25],
      ['size', 'x', 'size', 25],
      ['failures', 'maybe', 'failures', true],
      ['from', 'shanghai!', 'from', null],
      ['to', '', 'to', null],
    ] as const)('invalid %s=%j falls back to the default', (key, value, field, expected) => {
      expect(filtersFromParams({ [key]: value }, TODAY)[field]).toEqual(expected);
    });

    it('invalid or empty supplier lists fall back to all suppliers; unknown codes are dropped', () => {
      expect(filtersFromParams({ suppliers: '' }, TODAY).suppliers).toEqual(ALL_SUPPLIERS);
      expect(filtersFromParams({ suppliers: 'X,Y' }, TODAY).suppliers).toEqual(ALL_SUPPLIERS);
      expect(filtersFromParams({ suppliers: 'B,X,B' }, TODAY).suppliers).toEqual(['B']);
    });

    it('a start after the end falls back to the default date range', () => {
      const f = filtersFromParams({ start: '2026-12-20', end: '2026-12-01' }, TODAY);
      expect(f).toMatchObject({ start: '2026-11-09', end: '2026-12-09' });
    });

    it('upper-cases location codes', () => {
      expect(filtersFromParams({ from: 'cnsha' }, TODAY).from).toBe('CNSHA');
    });
  });

  describe('round-trip', () => {
    it.each<Partial<HistoryFilters>>([
      {},
      { start: '2026-10-01', end: '2026-10-31' },
      { suppliers: ['B', 'D', 'F'], failures: false },
      { from: 'CNSHA', to: 'USLAX', sort: 'responseTime', dir: 'desc', page: 4, size: 10 },
      { suppliers: ['A'], sort: 'status', page: 2, size: 50 },
    ])('filters → params → filters is lossless (%j)', (patch) => {
      const f = { ...defaults(), ...patch };
      expect(filtersFromParams(paramsFromFilters(f, TODAY), TODAY)).toEqual(f);
    });
  });

  describe('toHistoryQuery', () => {
    it('maps filters to the API query and omits the supplier list when all are selected', () => {
      expect(toHistoryQuery(defaults())).toEqual({
        start: '2026-11-09',
        end: '2026-12-09',
        suppliers: undefined,
        from: undefined,
        to: undefined,
        includeFailures: true,
        sortBy: 'date',
        sortDir: 'asc',
        page: 1,
        pageSize: 25,
      });
    });

    it('passes a partial supplier list, locations and failures off through', () => {
      const q = toHistoryQuery({ ...defaults(), suppliers: ['A', 'C'], from: 'CNSHA', to: 'USLAX', failures: false });
      expect(q).toMatchObject({ suppliers: ['A', 'C'], from: 'CNSHA', to: 'USLAX', includeFailures: false });
    });
  });

  describe('supplierSummary', () => {
    it.each([
      [ALL_SUPPLIERS, 'All suppliers'],
      [[], 'No suppliers'],
      [['B'], 'Supplier B'],
      [['A', 'C'], 'Supplier A, C'],
      [['A', 'C', 'D', 'F'], 'Supplier A, C (+2)'],
      [['F', 'A', 'C'], 'Supplier A, C (+1)'],
    ])('%j → %s', (selected, expected) => {
      expect(supplierSummary(selected, ALL_SUPPLIERS)).toBe(expected);
    });
  });
});
