# Ferien / School-Holiday Data — findings

Verified directly (WebFetch, 2026-07-23), not via the research agent (which hung and
produced nothing).

## Recommendation: OpenHolidaysAPI

`https://openholidaysapi.org` — open API covering all German Bundesländer (and other EU
states). Returns **school holidays (Schulferien)**, distinct from public holidays.

**Verified request** (Sachsen-Anhalt, school year 2025/26):
```
GET https://openholidaysapi.org/SchoolHolidays
    ?countryIsoCode=DE
    &subdivisionCode=DE-ST
    &validFrom=2025-08-01
    &validTo=2026-07-31
    &languageIsoCode=EN        # or DE
```
Returns 7 periods for 2025/26: Summer (…–08-08-2025), Autumn (10-13–10-25),
Christmas (12-22–01-05), Winter (01-31–02-06), Easter (03-30–04-04),
Pentecost (05-26–05-29), Summer (07-04–…-2026).

**Response shape** (per entry): `id`, `startDate`, `endDate`, `type` (`School`),
`name[]` (localized), `regionalScope`, `temporalScope` (`FullDay`), `nationwide`,
`subdivisions[]` (`DE-ST`). Maps cleanly onto our `calendar/*.yaml` `holidays[]`.

**Public holidays** (gesetzliche Feiertage) available from the sibling endpoint
`GET /PublicHolidays?countryIsoCode=DE&subdivisionCode=DE-ST&validFrom=…&validTo=…`.

## Usage in our tool

- Fetch once per school year, **cache into `calendar/sachsen-anhalt-<year>.yaml`** (data
  as files; no runtime API dependency; offline thereafter).
- **Not covered by the API:** school-specific *bewegliche Ferientage*, Projektwoche,
  Sportfest, Wandertag — these are per-school and entered by the teacher as `events[]`.
- **License:** OpenHolidaysAPI is an open project; for personal single-teacher use, fine.
  Confirm attribution/terms before redistributing the data in a public/product context.

## Alternatives (not chosen)
- `date.nager.at` — public holidays only, **no school holidays**. Insufficient.
- `ferien-api.de` — German school holidays, works, but OpenHolidaysAPI is broader
  (public + school, multi-country, richer schema). Keep as fallback.
