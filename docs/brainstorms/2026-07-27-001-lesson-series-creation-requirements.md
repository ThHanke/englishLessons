---
title: "Interactive Lesson Series Creation via Calendar Drag-Create"
type: requirements
date: 2026-07-27
topic: lesson-series-creation
status: ready-for-planning
artifact_contract: ce-brainstorm/v1
product_contract_source: user-conversation
---

# Interactive Lesson Series Creation via Calendar Drag-Create

## Problem

The calendar currently auto-computes lesson appointments from hardcoded `class_schedule`
YAML (`lesson_days: [Mon, Wed, Fri]` for grade 7 only). This was placeholder data — the
teacher doesn't know the actual lesson schedule until it's assigned by the school. The
teacher needs to **define when their English lessons happen** through the calendar UI,
not by editing YAML. Grades 5 and 6 have no schedule at all yet.

Lesson schedules are typically stable for one half-year (Halbjahr) and may change after
the semester break. A single drag-create should generate a full half-year of recurring
lesson appointments, automatically skipping holidays, weekends, and Sachsen-Anhalt
public holidays.

## Actors

- **Teacher** — drags in the calendar to define lesson time slots, reviews generated
  series, clicks appointments to access lesson planning context.

## Requirements

### Series Creation (drag-create flow)

- **S1.** Dragging a time range in SVAR calendar's day or week view opens a custom
  "Create lesson series" form. The existing `add-event` intercept routes by
  payload: drag-select (payload has `event.start` as a Date) → CreateSeries
  form; toolbar `+` button (no start) → existing PlanLessonForm for single-date
  planning. Both share the same intercept, distinguished at dispatch time.
  Note: series creation via drag is only available in day/week view (month
  view has no time-range drag); the toolbar `+` button works from any view
  for single-date planning.
- **S2.** The form pre-fills day-of-week and start/end time from the drag. Teacher can
  adjust both.
- **S3.** The form lets the teacher pick which grade/class to add the lesson to (from
  `plans/*/class.yaml`). Grades whose `modules.yaml` has DRAFT time fields are
  shown with a "(schedule only — no curriculum yet)" label; their series
  persists to the YAML but no curriculum-mapped appointments appear until
  modules are finalized.
- **S4.** The form shows which half-year the lesson falls in (H1: first school day
  through day before Winter Holidays; H2: day after Winter Holidays through last school
  day). Half-year boundary = Winter Holidays in the calendar YAML.
- **S5.** The form has a "recurring" toggle (default: on). When on, the series generates
  one appointment per week on the same weekday for the entire half-year, skipping:
  - Weekends (implicit — series is weekday-anchored)
  - All holidays in the calendar YAML (school holidays + public holidays)
  - Any `events[]` entries with `capacity: 0`
- **S6.** When recurring is off, only a single appointment is created for the dragged
  date.
- **S7.** Before confirming, the form shows a preview: total appointment count, first
  and last date, and a count of skipped weeks (holidays). The preview shows a
  loading indicator while computing; submit is disabled until the preview
  resolves. If zero valid appointments result (e.g., every week in the half-year
  is a holiday), the form shows an explanatory message and blocks submit.
  If the new series overlaps an existing series for any grade on the same
  weekday and time, the preview shows a warning (non-blocking — teacher may
  legitimately have back-to-back slots at different times).
- **S8.** On submit, the series definition persists to the calendar YAML's
  `class_schedule` (see Data Model below). The POST response returns the
  updated `TasksRangeResponse`; the form calls a refresh callback that
  updates Calendar's tasks/appointments state directly (no full page reload
  needed), so the calendar re-renders with all generated appointments.

### Data Model

- **D1.** `ClassScheduleEntry` in `src/schema/types.ts` gains a `lesson_slots` array:
  each slot has `id` (UUID, set at creation time for targeted deletion), `day`
  (weekday abbreviation), `start` (HH:MM), `end` (HH:MM), and `half_year`
  (1 or 2).
- **D2.** `enumerateSlots()` must be extended to consume `lesson_slots` directly
  (with `half_year_boundary` from D3), selecting only slots whose `half_year`
  matches the current cursor date's half on each iteration. This replaces the
  flat `lesson_days` approach. When `lesson_slots` is absent (legacy data),
  fall back to `lesson_days` for backward compatibility. Multiple slots on
  the same weekday (e.g., double periods) must produce one teaching slot each.
- **D3.** The calendar YAML gains a `half_year_boundary` field referencing the Winter
  Holidays entry, or an explicit date (e.g., `2027-02-01`), so the split is data-driven
  rather than hardcoded. Default: the `from` date of the first holiday named
  "Winter Holidays" found in the holidays array (the Winterferien mark the real
  Halbjahr boundary in Sachsen-Anhalt, not the Christmas break).
- **D4.** `CalendarFile` in the YAML gains the richer `class_schedule` shape. Example:
  ```yaml
  class_schedule:
    grade-7-realschule-2026:
      lesson_slots:
        - day: Mon
          start: "10:00"
          end: "10:45"
          half_year: 1
        - day: Wed
          start: "08:00"
          end: "08:45"
          half_year: 1
  ```

### Persistence

- **P1.** A new server endpoint (`POST /api/lesson-series`) accepts the series
  definition, generates the slot entries, writes them to the calendar YAML, and
  returns the updated schedule.
- **P2.** The projection engine re-derives appointments from the updated
  `class_schedule` on the next `GET /api/tasks` call (no separate appointment
  storage needed — the projection engine already generates per-slot appointments).
- **P3.** Deleting or editing a series updates/removes the corresponding
  `lesson_slots` entries in the YAML. (Editing = delete old + create new for
  simplicity in v1.)

### Appointment Interaction (click flow)

- **A1.** Clicking an appointment opens a detail form showing:
  - Class/grade and date
  - Curriculum module, week-in-module, phase (from existing `whichModule` mapping)
  - Coverage gaps for the active module (from existing `gapReport`)
  - Existing artifacts: links to `lesson-spec.json`, lesson plans, exercises (static
    HTML content under `artifacts/<class>/<date>/`)
- **A2.** The form has a single "Open chat" action calling the existing
  `onOpenChat(classId, date)` callback. When U5 (chat tab) is in scope, the
  callback gains an `intent: 'plan' | 'modify'` parameter (derived from
  whether a `lesson-spec.json` exists for that date) so the chat session can
  frame its greeting accordingly. Until then, a single button is sufficient.

### Half-Year Scope

- **H1.** H1 runs from `first_school_day` to the day before the Winter Holidays
  `from` date (2026-08-15 to 2027-01-31 for 2026/2027).
- **H2.** H2 runs from the day after the Winter Holidays `to` date to
  `last_school_day` (2027-02-07 to 2027-07-09 for 2026/2027).
- **Auto-detect.** The form auto-detects which half-year the dragged date falls
  in and pre-selects it. Teacher can switch if needed.

## Scope Boundaries

- **In scope:** Series creation, persistence to calendar YAML, appointment rendering,
  appointment click → context form with plan/modify action, projection engine
  integration.
- **Out of scope:** The chat interface itself (U5), actual lesson-spec file generation
  (Phase 3), multi-machine sync, undo/history for schedule changes.
- **Deferred:** Drag-to-resize an existing appointment, bulk series editing UI (v1:
  delete + recreate).

## Key Decisions

- **Extend `class_schedule` over new top-level field or explicit event storage.**
  The projection engine already consumes `class_schedule`; extending it with time-slot
  info is the minimal-plumbing path. Individual appointments are derived, not stored.
- **Winter Holidays as half-year boundary.** Matches how German schools split
  Halbjahre. Data-driven from the holidays array, not hardcoded.
- **Server writes to calendar YAML directly.** Single-teacher local tool — no
  concurrency concerns. The YAML file is the source of truth, version-controlled in
  git, teacher can review changes. The write must use a YAML serializer that
  preserves key ordering (the calendar YAML has no comments today, so
  comment preservation is not a concern for v1). Existing `writeYaml` in
  `src/schema/yaml.ts` already handles this.
- **YAML write endpoint is UI-only, not an agent tool.** The `POST /api/lesson-series`
  endpoint requires the per-session UI token (KTD9) which the Agent SDK chat
  session does not possess, so R8's read-only guarantee for the chat is
  unaffected by the new write capability.

## Dependencies

- Existing: `enumerateSlots()` holiday-skipping logic (`src/projection/slots.ts`)
- Existing: `moduleTasks()` appointment generation (`src/companion/server/moduleTasks.ts`)
- Existing: SVAR `add-event` intercept in `Calendar.tsx`
- Existing: `AppointmentPreview` component in `Calendar.tsx`
- Existing: `GET /api/lesson-preview` for date context
- New: YAML write capability on the server (reading already works via `loadYaml`)
- New: `POST /api/lesson-series` endpoint
- Upcoming: Chat interface (U5) to receive the plan/modify action context
