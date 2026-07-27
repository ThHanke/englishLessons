import { writeYaml } from "../schema/yaml.ts";
import { addDaysIso } from "../schema/dates.ts";
import type { CalendarFile, Holiday, PaceFactors } from "../schema/types.ts";

export interface OpenHolidaysPeriod {
  startDate: string;
  endDate: string;
  type: string;
  name: Array<{ language: string; text: string }>;
}

const OPENHOLIDAYS_BASE = "https://openholidaysapi.org";

/** Maps a raw OpenHolidaysAPI response into §3.3 `holidays[]` shape, preferring the EN name. */
export function mapSchoolHolidays(response: OpenHolidaysPeriod[]): Holiday[] {
  if (!Array.isArray(response) || response.length === 0) {
    throw new Error(
      "OpenHolidaysAPI /SchoolHolidays returned an empty or malformed response",
    );
  }
  return response.map((period) => {
    if (!period.startDate || !period.endDate) {
      throw new Error(
        `Malformed holiday period: missing startDate/endDate (id-less entry: ${JSON.stringify(period)})`,
      );
    }
    const name =
      period.name.find((n) => n.language === "EN")?.text ??
      period.name[0]?.text;
    if (!name) {
      throw new Error(
        `Malformed holiday period: no name entries (${JSON.stringify(period)})`,
      );
    }
    return { name, from: period.startDate, to: period.endDate };
  });
}

/** Maps a raw OpenHolidaysAPI /PublicHolidays response into §3.3 `holidays[]` shape. */
export function mapPublicHolidays(response: OpenHolidaysPeriod[]): Holiday[] {
  if (!Array.isArray(response)) {
    throw new Error(
      "OpenHolidaysAPI /PublicHolidays returned a malformed response",
    );
  }
  return response.map((period) => {
    if (!period.startDate || !period.endDate) {
      throw new Error(
        `Malformed public holiday entry: missing startDate/endDate (${JSON.stringify(period)})`,
      );
    }
    const name =
      period.name.find((n) => n.language === "EN")?.text ??
      period.name[0]?.text;
    if (!name) {
      throw new Error(
        `Malformed public holiday entry: no name entries (${JSON.stringify(period)})`,
      );
    }
    return { name, from: period.startDate, to: period.endDate };
  });
}

/**
 * Merges public holidays into the school-holiday list, dropping any public holiday fully
 * contained within an existing range (e.g. Christmas Day falls inside Weihnachtsferien) so
 * `holidays[]` has no redundant overlapping entries.
 */
export function mergeHolidays(
  schoolHolidays: Holiday[],
  publicHolidays: Holiday[],
): Holiday[] {
  const isContained = (h: Holiday) =>
    schoolHolidays.some((s) => h.from >= s.from && h.to <= s.to);
  return [...schoolHolidays, ...publicHolidays.filter((h) => !isContained(h))];
}

/**
 * Derives first/last school day from the two Summer-holiday boundary entries: the day after
 * the prior summer break ends, and the day before the next one begins.
 */
export function deriveSchoolYearBounds(holidays: Holiday[]): {
  first_school_day: string;
  last_school_day: string;
} {
  const summer = holidays
    .filter((h) => h.name.toLowerCase().includes("summer"))
    .sort((a, b) => a.from.localeCompare(b.from));
  if (summer.length < 2) {
    throw new Error(
      `Expected two Summer Holiday entries to bound the school year, found ${summer.length}`,
    );
  }
  return {
    first_school_day: addDaysIso(summer[0]!.to, 1),
    last_school_day: addDaysIso(summer[1]!.from, -1),
  };
}

const DEFAULT_PACE_FACTORS: PaceFactors = {
  pre_holiday_days: 2,
  pre_holiday_factor: 0.6,
  post_holiday_days: 2,
  post_holiday_factor: 0.8,
};

export function buildCalendarFile(params: {
  state: string;
  schoolYear: string;
  schoolHolidaysResponse: OpenHolidaysPeriod[];
  publicHolidaysResponse: OpenHolidaysPeriod[];
  className: string;
}): CalendarFile {
  const schoolHolidays = mapSchoolHolidays(params.schoolHolidaysResponse);
  const { first_school_day, last_school_day } =
    deriveSchoolYearBounds(schoolHolidays);
  const publicHolidays = mapPublicHolidays(params.publicHolidaysResponse);
  const holidays = mergeHolidays(schoolHolidays, publicHolidays);
  return {
    state: params.state,
    school_year: params.schoolYear,
    first_school_day,
    last_school_day,
    holidays,
    events: [],
    pace_factors: DEFAULT_PACE_FACTORS,
    class_schedule: {
      [params.className]: {},
    },
  };
}

async function fetchHolidayEndpoint(
  endpoint: "SchoolHolidays" | "PublicHolidays",
  subdivisionCode: string,
  validFrom: string,
  validTo: string,
): Promise<OpenHolidaysPeriod[]> {
  const url = `${OPENHOLIDAYS_BASE}/${endpoint}?countryIsoCode=DE&subdivisionCode=${subdivisionCode}&validFrom=${validFrom}&validTo=${validTo}&languageIsoCode=EN`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `OpenHolidaysAPI request failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as OpenHolidaysPeriod[];
}

async function main(): Promise<void> {
  const [schoolHolidaysResponse, publicHolidaysResponse] = await Promise.all([
    fetchHolidayEndpoint("SchoolHolidays", "DE-ST", "2026-08-01", "2027-07-31"),
    fetchHolidayEndpoint("PublicHolidays", "DE-ST", "2026-08-01", "2027-07-31"),
  ]);
  const calendar = buildCalendarFile({
    state: "sachsen-anhalt",
    schoolYear: "2026/2027",
    schoolHolidaysResponse,
    publicHolidaysResponse,
    className: "grade-7-realschule-2026",
  });
  const outPath = new URL(
    "../../calendar/sachsen-anhalt-2026-2027.yaml",
    import.meta.url,
  ).pathname;
  writeYaml(outPath, calendar);
  console.log(`Wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
