# Projection Engine (Component D)

Pure, deterministic mapping from an ideal module plan (B) onto a concrete school-year
calendar (C). No AI. Fully unit-testable. This is the heart of "which module are we in
on date X, and are we on track".

## Inputs

- `plans/<class>/modules.yaml` (ideal weeks per module)
- `calendar/<state>-<year>.yaml` (holidays, events, pace factors, class schedule)

## Algorithm

1. **Enumerate teaching slots.** Once a class has real `lesson_slots` in
   `class_schedule` (set via the companion calendar UI's drag-create), projection reads
   them directly (`enumerateSlots`) — walking `first_school_day..last_school_day` and
   matching each class's actual weekday/time/half-year pattern, minus holidays and
   `capacity: 0` events (fractional-capacity events reduce, not drop, the slot). This is
   the same enumeration the calendar's own appointments are built from, so "which dates
   does this class teach" can never disagree between the two. `weekly_lessons` is a
   count only at this point, used for budget math (step 3) and phase bucketing (step 5),
   not for picking days.

   Before a class has any `lesson_slots` yet, there is nothing exact to enumerate —
   projection falls back to a coarse week-count estimate (`estimateWeeklySlots`):
   `weekly_lessons` slots per week, distributed across the *first* available school days
   (Mon–Fri minus holidays/blackouts), with no claim about which specific weekdays the
   class will actually meet. This exists purely so a brand-new class gets an early
   module task-bar preview instead of showing nothing; it is never used to answer an
   exact per-date question (chat's teaching/non-teaching classification, appointment
   generation) — those require a real schedule and show nothing until one exists. The
   switch from estimated to real is automatic and un-cached: projection is recomputed
   from the calendar file on every read, so the moment a series is created the very next
   read reflects it.

2. **Assign a learning weight to each slot.**
   `weight = capacity * pace_factor(slot)` where `pace_factor` degrades slots within
   `pre_holiday_days` before / `post_holiday_days` after any holiday (multiplicative if
   both apply). Default weight 1.0.

3. **Compute effective capacity.** `total_weight = sum(slot.weight)`. Convert module
   `weeks` into a target weight budget: `module.budget = module.weeks * weekly_lessons`.
   Sum of module budgets should be ≤ total_weight; leftover is the buffer.

4. **Fill modules against weighted slots.** Walk slots in date order, consuming module
   budgets in sequence. A module spans the date range whose cumulative slot weight fills
   its budget. This naturally stretches modules across low-weight (pre-holiday) periods
   so a module near Christmas occupies more calendar days for the same learning budget.

5. **Tag each slot** with `{module_id, week_in_module, phase, milestone?}`.
   Phase heuristic within a module: first slots = `new_input`, middle = `practice`,
   final = `consolidation`, milestone slot = `assessment`. Repetition ratio from
   `pedagogy.repetition_ratio` reserves the corresponding share of early slots as
   `review` of the previous module.

6. **Milestone placement.** Each module's `milestone` lands on its last teaching slot
   (or a slot explicitly pinned). Tests must not fall on pre-holiday degraded slots or
   the first slot after a holiday — shift **forward-only** to the next healthy slot and
   record the move. Never shift a test earlier (that could place it before the assessed
   competence was taught, breaking the taught-before-test invariant §5.6). If no healthy
   forward slot exists before the next module's new content begins, compress/delay the
   next module rather than preponing the test.

## Outputs / queries

- `whichModule(date)` → module + week_in_module + phase + pace_factor + reason.
- `weekTable()` → per-school-week row: dates, module, planned phase, events, weight.
- `coverageLedger()` → fold every lesson's `covered` record (§3.7) into per-competence
  max depth and per-module `% at required depth`. Derived, deterministic.
- `gapReport(asOfDate)` → per active module + year: uncovered, under-depth, at-risk
  (needed by a milestone within N slots but below required depth), and year-end gaps.
- `driftReport(asOfDate)` → **two dimensions**: (1) _calendar_ drift — planned module
  position vs. actual (from dated artifacts), "behind by N slots"; (2) _coverage_ drift —
  from `gapReport`, e.g. "conditionals still `introduced`, `produce` required, test in 2
  slots". Suggests which module to compress / buffer week to spend, and which competences
  the next lessons must prioritize.
- `assessmentSchedule()` → list of milestone dates → grades feed.

## Drift & re-planning

Reality diverges: a lesson gets cancelled, a topic takes longer. The teacher records
actual position — derived automatically from the presence of dated artifacts and their
`covered` records (§3.7), no manual bookkeeping. `driftReport` recomputes from "today"
forward, spending buffer weeks first, then proposing which module to shorten (never
dropping an assessed competence before its milestone, and never one flagged at-risk in
the gap report). Re-planning is a re-run of the projection with a `progress_override`
anchor, so it stays deterministic and reviewable in git.

## Grades

Milestones of `type: test | project | presentation` emit graded events. A separate
`grades/<class>.yaml` records actual results keyed by milestone id. The engine only
schedules assessments and enforces that assessed competences were taught before the
test; it does not compute report-card grades (out of scope v1) but exposes the
schedule and weightings so a later component can.

## Pedagogy encoded here

- Repetition-first: each module opens with review slots of the prior module.
- Pace realism: pre/post-holiday degradation, event blackouts.
- No new grammar introduced on degraded slots — the fill step prefers to place
  `new_input` phases on full-weight slots and pushes practice/review into degraded
  ones.
- Spiral curriculum: because `covers` accumulate, later modules can require earlier
  competence IDs as `prior_covered`, and the exporter surfaces them for recycling.
