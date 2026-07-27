import { describe, it, expect, vi } from 'vitest';
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

  it('degrades nothing when pre_holiday_days is 0 (slice(-0) boundary, not the whole array)', () => {
    const zeroPreCalendar: CalendarFile = { ...smallCalendar, pace_factors: { ...smallCalendar.pace_factors, pre_holiday_days: 0 } };
    const slots = enumerateSlots(zeroPreCalendar, 'test-class');
    const weighted = weightSlots(slots, zeroPreCalendar);
    // Only post_holiday_days=2 should degrade anything; every pre-holiday slot stays full weight.
    const preHolidaySlots = weighted.filter((s) => s.date < '2026-09-14');
    for (const slot of preHolidaySlots) expect(slot.weight).toBe(slot.capacity);
  });
});

// ---------------------------------------------------------------------------
// lesson_slots tests
// ---------------------------------------------------------------------------

/** Shared base calendar for lesson_slots tests — Sep 1 to Sep 30, 2026. */
function makeSlotCalendar(overrides: Partial<CalendarFile> = {}): CalendarFile {
  return {
    state: 'test-state',
    school_year: '2026/2027',
    first_school_day: '2026-09-01',
    last_school_day: '2026-09-30',
    holidays: [],
    events: [],
    pace_factors: { pre_holiday_days: 2, pre_holiday_factor: 0.6, post_holiday_days: 2, post_holiday_factor: 0.8 },
    class_schedule: {},
    ...overrides,
  };
}

describe('enumerateSlots with lesson_slots', () => {
  it('Mon H1 + Wed H1 yields only Mon/Wed slots in H1 date range', () => {
    // Boundary at Sep 15: H1 = Sep 1-14, H2 = Sep 15-30
    const cal = makeSlotCalendar({
      half_year_boundary: '2026-09-15',
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
            { id: 's2', day: 'Wed', start: '08:00', end: '08:45', half_year: 1 },
          ],
        },
      },
    });
    const slots = enumerateSlots(cal, 'cls');
    // H1 Mon: Sep 7, 14; H1 Wed: Sep 2, 9
    expect(slots).toHaveLength(4);
    for (const s of slots) expect(s.date < '2026-09-15').toBe(true);
    const days = slots.map((s) => new Date(s.date + 'T00:00:00Z').getUTCDay());
    expect(days.every((d) => d === 1 || d === 3)).toBe(true); // Mon=1, Wed=3
  });

  it('Mon H1 + Thu H2 yields Mon in H1, Thu in H2', () => {
    const cal = makeSlotCalendar({
      half_year_boundary: '2026-09-15',
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
            { id: 's2', day: 'Thu', start: '08:00', end: '08:45', half_year: 2 },
          ],
        },
      },
    });
    const slots = enumerateSlots(cal, 'cls');
    const monSlots = slots.filter((s) => new Date(s.date + 'T00:00:00Z').getUTCDay() === 1);
    const thuSlots = slots.filter((s) => new Date(s.date + 'T00:00:00Z').getUTCDay() === 4);
    // Mon in H1 (before Sep 15): Sep 7, 14
    expect(monSlots).toHaveLength(2);
    for (const s of monSlots) expect(s.date < '2026-09-15').toBe(true);
    // Thu in H2 (Sep 15+): Sep 17, 24
    expect(thuSlots).toHaveLength(2);
    for (const s of thuSlots) expect(s.date >= '2026-09-15').toBe(true);
  });

  it('two Monday slots in H1 (double period) yields two RawSlots per Monday', () => {
    const cal = makeSlotCalendar({
      half_year_boundary: '2026-09-15',
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
            { id: 's2', day: 'Mon', start: '08:50', end: '09:35', half_year: 1 },
          ],
        },
      },
    });
    const slots = enumerateSlots(cal, 'cls');
    // H1 Mondays: Sep 7, 14 => 2 days x 2 slots = 4
    expect(slots).toHaveLength(4);
    // Each Monday appears exactly twice
    const sep7 = slots.filter((s) => s.date === '2026-09-07');
    const sep14 = slots.filter((s) => s.date === '2026-09-14');
    expect(sep7).toHaveLength(2);
    expect(sep14).toHaveLength(2);
  });

  it('lesson_slots present but empty yields zero slots', () => {
    const cal = makeSlotCalendar({
      class_schedule: { cls: { lesson_slots: [] } },
    });
    const slots = enumerateSlots(cal, 'cls');
    expect(slots).toHaveLength(0);
  });

  it('no lesson_slots field, lesson_days present uses existing behavior', () => {
    const cal = makeSlotCalendar({
      class_schedule: { cls: { lesson_days: ['Mon', 'Wed', 'Fri'] } },
    });
    const slots = enumerateSlots(cal, 'cls');
    expect(slots.length).toBeGreaterThan(0);
    const days = slots.map((s) => new Date(s.date + 'T00:00:00Z').getUTCDay());
    expect(days.every((d) => d === 1 || d === 3 || d === 5)).toBe(true);
  });

  it('holidays are still skipped when using lesson_slots path', () => {
    const cal = makeSlotCalendar({
      half_year_boundary: '2026-09-15',
      holidays: [{ name: 'Test Holiday', from: '2026-09-07', to: '2026-09-07' }],
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
          ],
        },
      },
    });
    const slots = enumerateSlots(cal, 'cls');
    // Only Sep 14 Monday in H1 (Sep 7 is a holiday)
    expect(slots).toHaveLength(1);
    expect(slots[0]!.date).toBe('2026-09-14');
  });

  it('capacity:0 events are still skipped when using lesson_slots path', () => {
    const cal = makeSlotCalendar({
      half_year_boundary: '2026-09-15',
      events: [{ name: 'Blocked', date: '2026-09-07', capacity: 0 }],
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
          ],
        },
      },
    });
    const slots = enumerateSlots(cal, 'cls');
    expect(slots.find((s) => s.date === '2026-09-07')).toBeUndefined();
    expect(slots).toHaveLength(1);
    expect(slots[0]!.date).toBe('2026-09-14');
  });

  it('deriveHalfYearBoundary throws: all lesson_slots active, logs warning, does not throw', () => {
    // No half_year_boundary, no Winter Holidays => deriveHalfYearBoundary throws
    const cal = makeSlotCalendar({
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
            { id: 's2', day: 'Thu', start: '08:00', end: '08:45', half_year: 2 },
          ],
        },
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const slots = enumerateSlots(cal, 'cls');
    // Both H1 and H2 slots active on all matching weekdays
    expect(slots.length).toBeGreaterThan(0);
    const monSlots = slots.filter((s) => new Date(s.date + 'T00:00:00Z').getUTCDay() === 1);
    const thuSlots = slots.filter((s) => new Date(s.date + 'T00:00:00Z').getUTCDay() === 4);
    expect(monSlots.length).toBeGreaterThan(0);
    expect(thuSlots.length).toBeGreaterThan(0);
    expect(warnSpy).toHaveBeenCalledWith('Could not derive half-year boundary; treating all lesson_slots as active');
    warnSpy.mockRestore();
  });

  it('lesson_days absent and lesson_slots absent yields empty', () => {
    const cal = makeSlotCalendar({
      class_schedule: { cls: {} },
    });
    const slots = enumerateSlots(cal, 'cls');
    expect(slots).toHaveLength(0);
  });
});

describe('weightSlots with double-period slots', () => {
  it('double-period Monday before holiday: both slots degraded, only one day consumed from N-day window', () => {
    // Holiday Sep 14-18; pre_holiday_days=2 means last 2 *days* before Sep 14.
    // With double-period Mon, Sep 7 has 2 slots and Sep 11 (Wed) has 1 slot.
    // The last 2 unique days before the holiday are Sep 11 (Fri actually - let's recalc)
    // Sep 1=Tue, Sep 7=Mon, Sep 9=Wed, Sep 11=Fri -- wait, Sep 11 is Friday
    // Let me use Mon+Wed slots. Days before holiday (Sep 14): Sep 7 Mon, Sep 9 Wed
    // pre_holiday_days=2 means Sep 7 and Sep 9. Both Mon slots on Sep 7 should degrade.
    const cal = makeSlotCalendar({
      half_year_boundary: '2026-12-20',
      holidays: [{ name: 'Test Holiday', from: '2026-09-14', to: '2026-09-18' }],
      class_schedule: {
        cls: {
          lesson_slots: [
            { id: 's1', day: 'Mon', start: '08:00', end: '08:45', half_year: 1 },
            { id: 's2', day: 'Mon', start: '08:50', end: '09:35', half_year: 1 },
            { id: 's3', day: 'Wed', start: '08:00', end: '08:45', half_year: 1 },
          ],
        },
      },
    });
    const slots = enumerateSlots(cal, 'cls');
    const weighted = weightSlots(slots, cal);

    // Slots before holiday: Sep 2 Wed, Sep 7 Mon (x2), Sep 9 Wed
    // Last 2 unique days: Sep 7 and Sep 9
    const sep7Slots = weighted.filter((s) => s.date === '2026-09-07');
    const sep9Slots = weighted.filter((s) => s.date === '2026-09-09');
    expect(sep7Slots).toHaveLength(2);
    // Both Sep 7 slots should be pre-degraded
    for (const s of sep7Slots) expect(s.weight).toBeCloseTo(1 * 0.6);
    // Sep 9 slot should also be pre-degraded
    expect(sep9Slots).toHaveLength(1);
    expect(sep9Slots[0]!.weight).toBeCloseTo(1 * 0.6);
    // Sep 2 is 3 unique days before holiday, so NOT degraded (only last 2 days)
    const sep2Slots = weighted.filter((s) => s.date === '2026-09-02');
    expect(sep2Slots).toHaveLength(1);
    expect(sep2Slots[0]!.weight).toBe(1);
  });
});
