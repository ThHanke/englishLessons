import { describe, it, expect } from 'vitest';
import type { CalendarFile } from '../schema/types.ts';
import { deriveHalfYearBoundary, dateHalfYear, halfYearRange } from './halfYear.ts';

const calendar = {
  state: 'test',
  school_year: '2026/2027',
  first_school_day: '2026-08-15',
  last_school_day: '2027-07-09',
  holidays: [
    { name: 'Winter Holidays', from: '2027-02-01', to: '2027-02-06' },
  ],
  events: [],
  pace_factors: { pre_holiday_days: 0, pre_holiday_factor: 1, post_holiday_days: 0, post_holiday_factor: 1 },
  class_schedule: {},
} as CalendarFile;

describe('deriveHalfYearBoundary', () => {
  it('returns explicit half_year_boundary when set', () => {
    const cal = { ...calendar, half_year_boundary: '2027-01-20' };
    expect(deriveHalfYearBoundary(cal)).toBe('2027-01-20');
  });

  it('derives boundary from Winter Holidays when no explicit field', () => {
    expect(deriveHalfYearBoundary(calendar)).toBe('2027-02-01');
  });

  it('throws when no explicit field and no Winter Holidays entry', () => {
    const cal = { ...calendar, holidays: [] };
    expect(() => deriveHalfYearBoundary(cal)).toThrow('cannot derive the Halbjahr boundary');
  });
});

describe('dateHalfYear', () => {
  it('returns 1 for dates before the boundary', () => {
    expect(dateHalfYear('2026-10-15', '2027-02-01')).toBe(1);
  });

  it('returns 2 for dates after the boundary', () => {
    expect(dateHalfYear('2027-03-15', '2027-02-01')).toBe(2);
  });

  it('returns 2 for the boundary date itself', () => {
    expect(dateHalfYear('2027-02-01', '2027-02-01')).toBe(2);
  });
});

describe('halfYearRange', () => {
  it('returns first_school_day to day before boundary for H1', () => {
    const range = halfYearRange(calendar, 1);
    expect(range).toEqual({ from: '2026-08-15', to: '2027-01-31' });
  });

  it('returns day after Winter Holidays end to last_school_day for H2', () => {
    const range = halfYearRange(calendar, 2);
    expect(range).toEqual({ from: '2027-02-07', to: '2027-07-09' });
  });
});
