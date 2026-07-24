---
name: module-derive
description: Derive draft module clusters (topics + goals + covers[] + pedagogy.new_grammar) from a frozen curriculum band, including the 5/6 band's grade 5 vs grade 6 allocation. Time/calendar fields are written as DRAFT (KTD7). Use after a grade-bands/*.yaml file is frozen (U3/U4).
---

# Module derivation (Stage: cluster + allocate)

Groups a frozen curriculum band's content fields, grammar progression, and skill
competences into coherent topic clusters (draft modules), teacher-refined afterward. Same
derive-then-refine pattern as vocabulary generation (§3.6a).

## Grade allocation (5/6 band only, KTD5)

The 5/6 band spans two school years without naming which grade teaches what. This step
additionally allocates every **grammar_item** and **content_field**, plus the Wortschatz/
Aussprache/Orthografie functional-language items, to exactly one of grade 5 or grade 6 —
an agent draft the teacher refines, respecting:

- **Prerequisite order**: present tenses (`simple_present`, `present_progressive`) before
  `simple_past`; `going_to_future`/`will_future` after present tenses are established.
- **Spiral progression**: grade 5 ≈ foundations (basic sentence forms, present tenses,
  core noun/pronoun/article mechanics), grade 6 ≈ extension (past, futures, present
  perfect, more complex noun mechanics like genitive, comparison).

**Kommunikative Kompetenzen (the `fk.k.*` skill statements), Interkulturelle, and
Methodische entries are treated as spiral/continuous, not grade-exclusive** — a listening
or speaking competence is practiced and deepened across both years, not "finished" in one.
These are referenced by modules in *both* grade files at an appropriate depth, rather than
forced into a single-grade ownership the source text doesn't support. This is documented
per-band in `docs/module-derivation-notes.md`.

Grammar/content/functional-language items *are* single-grade-exclusive, because KTD5 and
the plan's own worked example ("simple past not allocated to grade 5 before present
tenses") frame the split specifically in terms of grammar sequencing.

## Grade-7 vs grade-8 in the 7/8 Realschule band

The source doesn't split grade 7 from grade 8 (Open Question, plan). This step decides
which grammar items belong to the grade-7 year-plan (approachable first steps into B1) and
which are deferred to a future grade-8 file (not created in Phase 0 — Scope Boundaries).
Deferred items are still present in the band file (U4) but excluded from
`plans/grade-7-realschule/modules.yaml`'s `covers`/`new_grammar` — this is expected, not a
coverage gap: the aggregate coverage lint only runs across module files that exist for a
band's full grade span, and 7-8-realschule's grade-8 file doesn't exist yet.

## Module shape

Each module: `id`, `title`, `content_fields`, `goals`, `covers[]` (`{id, required_depth}`
mapped from curriculum `mode` per the HTD table — `produce` mode → `required_depth:
produce` is the strong default; `understand`-only stays `understand`), `milestone` stub
(`type`, `assesses`), `pedagogy.new_grammar`. `weeks` and all class-level time fields
(`total_weeks`, `weekly_lessons`, `buffer_weeks`) are DRAFT sentinels (KTD7) — Phase 1 fills
them without reshaping the file. Bias clustering toward Vernetzung (cross-referencing
recurring content fields) + Differenzierung (mixing receptive/productive skill work per
module) per the "gute Aufgaben" hallmarks (06-exercise-design-reference).

## Procedure

1. Load the frozen `grade-bands/<band>.yaml`.
2. For a single-grade band (7-8-realschule → grade 7 scope): cluster content_fields +
   grammar + competences into 3-4 topic modules in teaching order.
3. For the 5/6 band: first allocate every grammar/content/functional item to grade 5 xor
   grade 6 per the rules above, then cluster each grade's allocated items into 3-4 modules.
4. Every module's `covers` for a produce-mode grammar item uses `required_depth: produce`;
   verify with `checkCoverageLintAcrossModules` (src/validate/referentialValidator.ts) run
   across the full ordered file sequence for that band before treating the draft as done.
5. Write `class.yaml` (name, grade, track, curriculum ref) and `modules.yaml` per file.
6. Record the grade-5/6 split rationale (and the grade-7/8 split rationale) in
   `docs/module-derivation-notes.md`.
7. Teacher reviews and refines; conformance enforced by U5's validators (not unit tests —
   this is AI-emitted data).
