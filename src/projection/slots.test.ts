import { describe, it, expect } from 'vitest';
import { loadYaml } from '../schema/yaml.ts';
import type { CalendarFile } from '../schema/types.ts';
import { enumerateSlots, weightSlots } from './slots.ts';

const smallCalendar = loadYaml<CalendarFile>(new URL('./fixtures/calendar-small.yaml', import.meta.url).pathname);
const shortGapCalendar = loadYaml<CalendarFile>(new URL('./fixtures/calendar-short-gap.yaml', import.meta.url).pathname);
const noHolidaysCalendar = loadYaml<CalendarFile>(new URL('./fixtures/calendar-no-holidays.yaml', import.meta.url).pathname);

describe('enumerateSlots', () => {
  it('yields the expected slot count with no slots inside the holiday range', () => {
    const slots = enumerateSlots(smallCalendar, 'test-class');
    expect(slots.some((s) => s.date >= '2026-09-14' && s.date <= '2026-09-18')).toBe(false);
    // 13 Mon/Wed/Fri dates in range, minus 3 inside the holiday, minus 1 dropped by the
    // capacity:0 event on 09-02 = 9.
    expect(slots).toHaveLength(9);
  });

  it('drops a capacity:0 event slot entirely and keeps a fractional-capacity event slot reduced', () => {
    const slots = enumerateSlots(smallCalendar, 'test-class');
    expect(slots.find((s) => s.date === '2026-09-02')).toBeUndefined();
    expect(slots.find((s) => s.date === '2026-09-04')).toEqual({ date: '2026-09-04', capacity: 0.5 });
  });
});

describe('weightSlots', () => {
  it('applies pre_holiday_factor to a slot 1 school-day before the window, not 3 school-days before (boundary)', () => {
    const slots = enumerateSlots(smallCalendar, 'test-class');
    const weighted = weightSlots(slots, smallCalendar);
    const closest = weighted.find((s) => s.date === '2026-09-11')!; // 1 school-day before holiday
    const third = weighted.find((s) => s.date === '2026-09-07')!; // 3 school-days before holiday
    expect(closest.weight).toBeCloseTo(1 * 0.6);
    expect(third.weight).toBeCloseTo(1);
  });

  it('applies post_holiday_factor to the first slots after a holiday', () => {
    const slots = enumerateSlots(smallCalendar, 'test-class');
    const weighted = weightSlots(slots, smallCalendar);
    expect(weighted.find((s) => s.date === '2026-09-21')!.weight).toBeCloseTo(1 * 0.8);
    expect(weighted.find((s) => s.date === '2026-09-23')!.weight).toBeCloseTo(1 * 0.8);
    expect(weighted.find((s) => s.date === '2026-09-25')!.weight).toBeCloseTo(1);
  });

  it('combines pre- and post-holiday factors multiplicatively in a short gap between two holidays', () => {
    const slots = enumerateSlots(shortGapCalendar, 'test-class');
    const weighted = weightSlots(slots, shortGapCalendar);
    const gapSlot = weighted.find((s) => s.date === '2026-09-11')!;
    expect(gapSlot.weight).toBeCloseTo(1 * 0.5 * 0.5);
  });

  it('gives every scheduled weekday slot weight 1.0 on a zero-holiday, zero-event calendar', () => {
    const slots = enumerateSlots(noHolidaysCalendar, 'test-class');
    const weighted = weightSlots(slots, noHolidaysCalendar);
    expect(weighted.length).toBeGreaterThan(0);
    for (const slot of weighted) expect(slot.weight).toBe(1);
  });
});
