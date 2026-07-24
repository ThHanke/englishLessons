# Module derivation notes (U7)

Records the grade-5/6 allocation rationale and the grade-7/8 scoping decision (KTD5, plan
Open Questions). Both are agent drafts for teacher refinement, not taken from the Lehrplan.

## 5/6 band: grade 5 vs grade 6 allocation

**Grammar, content fields, and Wortschatz/Aussprache/Orthografie functional-language items
are allocated exclusively to one grade**, following prerequisite order and spiral
progression (foundations → extension):

| Grade 5 (foundations) | Grade 6 (extension) |
|---|---|
| `fk.g.sentence_forms`, `fk.g.simple_present`, `fk.g.present_progressive` | `fk.g.simple_past`, `fk.g.going_to_future`, `fk.g.will_future` (after present tenses are established), `fk.g.present_perfect` |
| `fk.g.numbers`, `fk.g.articles`, `fk.g.pronouns`, `fk.g.noun_plural` | `fk.g.prepositions`, `fk.g.genitive`, `fk.g.adjectives_comparison` |
| `c.personal.family_friends`, `c.social.freizeit_schule` | `c.alltag.dienstleistung_tagesablauf`, `c.natur.wetter` |

Rationale: present tenses must be secure before simple past is introduced; futures build on
present-tense mechanics. Numbers/articles/pronouns/plural are the most basic noun-phrase
mechanics (grade 5); prepositions/genitive/comparison are more complex noun-phrase extensions
(grade 6). Content fields follow the same foundations→extension shape: self/family/school
first, then daily-life services/routines and weather.

**Kommunikative Kompetenzen (`fk.k.*`), Interkulturelle, and Methodische entries are treated
as spiral/continuous, not grade-exclusive.** The Lehrplan states each as a single two-year
skill statement per Bereich (e.g. one "Hör- und Hör-/Sehverstehen" statement for the whole
5/6 band) — there is no textual basis for splitting a listening or speaking competence into
a "grade 5 version" and a "grade 6 version". Instead, a subset is referenced by grade-5
modules (lighter, mostly `understand`-depth or simpler `produce` tasks) and the remaining
subset by grade-6 modules (more complex `produce` tasks, e.g. sprachmittlung.2 vs .1). This
matches how the Lehrplan itself frames these as developing across the whole band, not owned
by one year.

Every produce-mode `grammar_item` in `5-6.yaml` is covered at `required_depth: produce` by
some module across the grade-5 + grade-6 file pair (verified — see Verification below); this
was a design fix to U5's coverage lint (it now aggregates across every modules.yaml sharing a
curriculum band, since the 5/6 band's two-file split means no single file covers everything).

## 7/8 Realschule band: grade-7 vs grade-8 scoping

The source doesn't split grade 7 from grade 8 (plan Open Questions). `7-8-realschule.yaml`
(U4) captures all 7/8 entries; this step decides which grammar items belong to the grade-7
year-plan (approachable first steps into B1) versus a future grade-8 file (not created in
Phase 0 — additive later, Scope Boundaries):

| Grade 7 (this Phase 0 file) | Deferred to grade 8 (not built yet) |
|---|---|
| `fk.g.passive`, `fk.g.present_perfect`, `fk.g.question_tag`, `fk.g.gerund` | `fk.g.conditional_1`, `fk.g.conditional_2`, `fk.g.relative_clauses`, `fk.g.modals`, `fk.g.adverbs` |

Rationale: passive voice, present perfect, question tags, and the gerund are the more
approachable B1 entry points, natural next steps after the 5/6 band's present-tense/simple
past foundation. Conditionals, relative clauses, modals-with-substitute-forms, and adverb
formation are denser constructions better suited to a full grade-8 year once grade-7's
foundation is secure.

**This is an accepted, expected coverage gap in Phase 0** — the aggregate coverage lint
(`checkCoverageLintAcrossModules`) is deliberately **not** run against the full
`7-8-realschule.yaml` band in `npm run validate` (U8), because that band's grade-8 file
doesn't exist yet. Running it would falsely flag the five deferred grammar items as
"uncovered" when they are correctly out of Phase-0 scope. Per-file reference validation
(`validateModulesReferential` — every `covers`/`assesses` id resolves) still runs and passes.

## Verification

- `validateModulesReferential` passes with zero errors for all three modules.yaml files
  (every `covers`/`assesses` id resolves against its band).
- `checkCoverageLintAcrossModules([...grade-5 modules, ...grade-6 modules], band56)` passes
  with zero errors — every produce-mode grammar item in `5-6.yaml` is covered before any
  milestone that assesses it.
- Grade-7's modules pass per-file reference validation; the full-band aggregate check is
  intentionally skipped for `7-8-realschule.yaml` per the scoping note above.
- Time fields are DRAFT sentinels throughout (KTD7); `checkTimeFields` reports them deferred,
  not failed.

Teacher review of the grade-5/6 split and the grade-7/8 scoping is outstanding (KTD5, §5.8 —
no independent cross-check for v1, teacher review suffices).
