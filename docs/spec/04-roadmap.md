# Roadmap, Open Questions, Research Brief

## 5.0 Decisions log

- **Scope: grades 5, 6, 7 (Sekundarschule Sachsen-Anhalt, English).** 5/6 = single
  combined band spread over two year-plans; **grade 7 = Realschule track only** (7/8 RS
  band, grade-7 portion; Hauptschule out of scope). CEFR band-level: 5/6 A1→A2, grade 7
  on the path to B1.
- **Audience: personal now, product later.** Build single-teacher/local first, but keep
  the data model textbook-agnostic and folder-per-curriculum so multi-teacher/multi-book
  is an additive change, not a rewrite.
- **Textbook = citation only, teacher-supplied in conversation.** Never ingest/store
  book content. The orchestrator asks the teacher for references ("S. 45, Aufgabe 1.4")
  after drafting the plan and embeds them as teacher-directed steps (§4.2, §4.6). A
  citation is not copyrighted content, so artifacts stay publishable. The controlled
  vocabulary is agent-generated from the curriculum (§3.6a), not from any book.
- **Primary interface is the companion app (calendar + chat).** The teacher manages
  lesson scheduling via an interactive calendar (drag-create lesson series per half-year)
  and plans lessons through an embedded chat backed by the Claude Agent SDK. Clicking an
  appointment shows module context; "Plan lesson" opens a seeded chat session with
  pedagogical skills. The `prepare-lesson` orchestrator (§4.6) runs inside this chat.
- **Two-layer delivery: local companion + static published output** (§4.7). The companion
  (Express + Vite + React, `127.0.0.1` only) is the authoring environment. Generated
  artifacts are committed; `git push` → GitHub Pages → stable per-date static URLs.
  Artifacts remain framework-free single-file HTML. The calendar uses `@svar-ui/react-
  calendar` (MIT).
- **Component A = our own flat typed extraction, NOT the ontology.** One parse of the
  Lehrplan into typed entries (competence, grammar_item, content_field, text_type,
  vocabulary[derived], task_pattern[pointer], hint_method, reference) each tagged with
  `used_in` + `source` (§3.1). Rationale: FWU-DE/lehrplan-ontologie is BFO-based — upper-
  ontology + OWL/SPARQL overhead with no payoff for our scope. Ontology kept only as an
  optional comparison/validation check (§5.7 task), never a runtime dependency.
- **Bidirectional coverage tracking** (§3.7). Modules = curriculum-derived clusters of
  topics/goals with target competences at a required *depth* (planned→introduced→
  practiced→assessed). Every generated lesson records what it actually covered; the
  engine folds these into a coverage ledger and a depth-aware gap report (uncovered /
  under-depth / at-risk / year gaps). Feeds the orchestrator recall and a two-dimensional
  drift report. This is the measurable form of the scaffold thesis.
- **Build sequence: calendar/scaffold first** — settled on the merits (the scaffold is
  the product; generation is commodity), see §00 §2 and §5.5. Not merely preference.
- **Runtime: TypeScript** (settled). One language for engine + static build; WASM-native;
  compiled component framework (Svelte/Lit) for clean interactive exercises bundled to
  self-contained HTML. Delivery layer static regardless.
- **Listening audio: browser Web Speech API** (`speechSynthesis`), synthesized at runtime,
  transcript fallback (§4.4). No bundled audio; stays single-file. Piper TTS deferred.
- **NLP validation: deferred** — not obviously needed; revisit only if generated grammar
  answer-keys prove unreliable (then a WASM client-side checker).
- **Exercise widgets: custom TS (Lit/Svelte), not H5P** (research 05, §06). Generated not
  authored, so H5P's authoring value is moot; skip its runtime + license mess. SortableJS
  (MIT, verified) for drag-drop; rest hand-built. First-build set: gap_fill, mcq, matching,
  error_correction, crossword.

## 5.1 Phasing

### Implementation status (as of 2026-07-28)

`docs/plans/*` (six implementation plans, Phase 0 through the companion's lesson-series
feature) have been executed and removed — git history is the record of *how*; this is
the record of *what* landed, checked against the actual repo state, not the plans'
own checkboxes (several were stale).

- **Phase 0 (curriculum + clusters + vocabulary) — DONE.**
  `curriculum/sachsen-anhalt-sekundarschule-englisch-2019/*.yaml` (frozen extraction),
  `plans/grade-{5,6,7-realschule}/modules.yaml` (module clusters, goals, non-DRAFT
  `weekly_lessons` for all three grades per the official Stundentafel),
  `vocabulary/grade-{5,6,7}.yaml` (NGSL-leveled, chained 5→6→7).
- **Phase 1 (projection + coverage engine) — DONE.**
  `calendar/sachsen-anhalt-2026-2027.yaml` (real fetched 2026/2027 calendar),
  `src/projection/` (`slots.ts`, `fillModules.ts`, `query.ts`/`whichModule`,
  `halfYear.ts`), `src/coverage/` (`ledger.ts`, `gapReport.ts`, `driftReport.ts`), the
  insurance-spike widget (`src/widgets/gapFill.ts`).
- **Phase 2 (companion app + spec export, components E/F) — DONE.**
  `src/companion/server/` (Agent SDK session engine with the `DISALLOWED_TOOLS`
  deny-list, HTTP server + Origin/token security, routes for calendar/chat/tasks/
  lesson-preview/lesson-series), `src/companion/web/` (multi-grade overlay calendar
  with drag-create lesson series per half-year, chat tab with seeded date context and
  streaming), artifact tools (`save_lesson_spec`/`save_material` via an MCP server),
  8 pedagogical skills wired into the chat system prompt. README documents the
  `claude setup-token` step. A live-SDK regression test
  (`agentSession.live-sdk.test.ts`, opt-in via `npm run test:live-sdk`) now proves the
  deny-list holds against a real Agent SDK call even under a plausible in-scope
  pretext to bypass `save_lesson_spec` with a direct `Write`.
- **Component I (artifact registry / static delivery, §00 component map, §4.7) —
  DONE** (2026-07-28 plan). `.github/workflows/pages.yml` builds `src/publish/buildSite.ts`'s
  output and deploys it on push (least-privilege permissions, `workflow_dispatch` for a
  manual re-deploy); the site follows the `/`, `/classes/<class>/`,
  `/classes/<class>/<date>/` URL scheme, with `renderLessonPage.ts` rendering each
  `lesson-spec.json` as a human-facing `lesson-plan.html`-equivalent page linking to its
  materials. The companion's `GET /api/artifacts/<class>/<date>/<...path>` route (KTD6)
  serves the same tree locally before a push; the calendar's appointment popup links to
  each generated material plus the rendered lesson-spec preview instead of a static
  "· planned" label. Remaining manual step: the repo's Settings → Pages → Source switch
  to "GitHub Actions" (documented in README, can't be automated by a workflow file).
- **Phase 3 (generation pipeline G + first 3 exercise skills H) — DONE** (2026-07-28
  plan) for the `gap_fill`/`mcq`/`matching` slice of the decided first-build set.
  A typed `generate_exercise` MCP tool (`src/companion/server/artifactTools.ts`)
  dispatches to `src/widgets/{gapFill,mcq,matching}.ts`, writes self-contained HTML
  under `materials/`, and appends a `manifest.json` entry (the `covered` record,
  §3.7a) at `practiced` depth. `save_material`'s schema dropped `'exercise'` so the
  old free-form bypass is closed. `error_correction` and `crossword` remain unbuilt
  (deferred to a follow-up plan per the roadmap's original ordering).
- **Phase 3.5 (coverage loop closes) — DONE** for exercise-generation coverage.
  `buildLedger.ts` now folds both `lesson-spec.json` (capped at `introduced` — a plan,
  not confirmed delivery) and `manifest.json` (real generated materials, `practiced`)
  into the ledger, with the stronger depth winning per competence+date via the
  existing max-depth-wins fold. Named limitation carried forward: a manifest entry
  proves a worksheet was authored, not that a pupil completed it — the same
  exposure-not-mastery caveat as lesson-spec-derived coverage. A `produce`-required
  competence covered only via `mcq`/`matching` still shows as under-depth, since
  neither is in `PRODUCTIVE_EXERCISE_TYPES` — expected, not a regression.
- **Phase 4 (breadth) — NOT STARTED.**
- **`klassenarbeit` skill (§5.6) — NOT BUILT.** `assessment-design` (the
  blueprint-before-items skill) exists but the full Erlass-grounded artifact set
  (`klassenarbeit.html` + `erwartungshorizont.html` with AFB tagging and the §6.3
  `notenschluessel`) is not implemented.

**Phase 0 — Curriculum + clusters + vocabulary (A + §3.2 derivation + §3.6).** Scope =
grades 5, 6, 7. Parse the Saxony-Anhalt **5/6 band** and the **grade-7 portion of the
7/8 Realschule band** (HS out of scope) into `curriculum/**.yaml`; **derive the topic/
goal clusters** (draft modules with target competences + required depth) and the owned
controlled-vocabulary, both from the curriculum, then teacher-refine. Note the 5/6 band
spreads across two year-plans (grade 5, grade 6). Deliverable: stable competence IDs +
draft module clusters + known-vocab allow-list for grades 5–7.

**Phase 1 — Plan + projection + coverage schema (B, C, D, §3.7).** Finalize one module
sequence for grade 7, one calendar for 2025/2026, build the deterministic projection
engine with tests, including the `coverageLedger`/`gapReport` queries (schema + folding
logic; they read `covered` records once lessons exist). Deliverable: `whichModule(date)`,
week table, two-dimensional `driftReport`. **Insurance spike:** hand-write one
`lesson-spec.json` + one `gap_fill` widget to sanity-check worksheet quality early.

**Phase 2 — Companion app + spec export (E, F).** Local companion with interactive
calendar (multi-grade overlay, lesson series management via drag-create), embedded chat
(Claude Agent SDK), and lesson-spec export. Deliverable: the teacher can manage their
schedule, browse the projected year, click an appointment to see module context, and
start a chat session to plan a lesson.

**Phase 3 — Generation (G + first 3 H skills).** Lesson generator plus the first three of
the decided first-build set (§06): `gap_fill`, `mcq`, `matching` (`error_correction`,
`crossword` follow). Deliverable: pick a date → get a lesson plan and 3-widget material
set, linked back in the calendar.

**Phase 3.5 — Coverage loop closes.** Once lessons emit `covered` records, wire the
ledger + gap report into the orchestrator recall step and the calendar (show per-module
`% at required depth`, gaps). This is where the reverse/feedback half becomes live.

**Phase 4 — Breadth.** Remaining exercise skills, a second class/track to prove
extensibility, drift-driven re-planning in the tool, grades feed.

## 5.2 Open questions (decide before/with research)

1. ~~**Runtime.**~~ RESOLVED: **TypeScript**. One language across engine + static build;
   WASM-native (client-side validation/logic path later); a compiled component framework
   (Svelte/Lit) gives clean interactive exercises that still bundle to self-contained HTML.
2. ~~**Web tool framework.**~~ RESOLVED: **local companion app** (Express + Vite +
   React + `@svar-ui/react-calendar`). Teacher-facing authoring environment on
   `127.0.0.1`; published artifacts remain framework-free static HTML on GitHub Pages.
   See §4.1, §4.7 and Decisions log.
3. ~~**Listening materials.**~~ RESOLVED: browser **Web Speech API** (`speechSynthesis`)
   reads text at runtime — no bundled audio, stays single-file. Ship transcript fallback;
   voices vary by device. Piper-pre-rendered audio deferred (§4.4).
4. ~~**Plan authoring in tool vs. YAML.**~~ RESOLVED: v1 = YAML only (per §4.1 — the site
   is not an authoring IDE; plan editing happens in the YAML files).
5. **Grade computation scope.** v1 schedules assessments only. Is report-card grade
   math wanted later?
6. ~~**Multi-state / multi-subject reach.**~~ DEFERRED — answerable only after everything
   is in place and first classroom trials run. Data model stays generic (folder-per-
   curriculum) meanwhile so it's not foreclosed.
7. **Where skills run.** These are Claude Code skills in this repo. Confirm distribution
   (repo-local `.claude/skills` vs. a plugin). Likely settled during implementation-plan.

Process decisions (this session): open Q3 (ontology comparison + colleague questions)
**deferred ~1 week–1 month**. Next steps: a **ce-doc-review of this spec**, then generate
**implementation plans from the spec** (ce-plan) once the review lands.

## 5.3 Research brief (the agent pass the user asked for)

Goal: find reusable, permissively-licensed (MIT/Apache/BSD/CC-BY or public-domain)
building blocks so we build integration, not primitives. For each hit record:
name, license, last activity, fit, integration cost, risk.

Investigate:
1. ~~**German school holiday / Ferien data**~~ RESOLVED (verified, `research/04-ferien-data.md`).
   **OpenHolidaysAPI** `/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-ST&validFrom…&validTo…`
   returns Sachsen-Anhalt Schulferien as clean JSON; fetch once, cache into `calendar/*.yaml`.
   Public holidays via `/PublicHolidays`. School-specific events entered manually.
2. **School-year / academic calendar libraries** — anything that models term structure,
   teaching weeks, holiday-aware date walking, so we don't hand-roll all of D.
3. **Curriculum / competency frameworks** — existing open encodings of CEFR descriptors
   or German Bildungsstandards we can align competence IDs to (e.g. CEFR companion
   volume machine-readable, ELP descriptors).
3b. **Permissive frequency / graded wordlist** — NOW NEEDED (upgraded from optional by
   the review). NGSL/GSL/Oxford-3000-style, license + format. Powers the **required**
   leveling validation of the agent-generated controlled vocab (§3.6a) before it becomes
   the hard allow-list. Alternative if no clean list: a second automated CEFR-level pass.
4. ~~**Interactive exercise / H5P engines**~~ RESOLVED (research 05, §06). Custom TS
   widgets (Lit/Svelte → self-contained HTML); **H5P NOT adopted** (we generate not author;
   heavy runtime; murky per-content-type license). Only MIT lib confirmed for use:
   **SortableJS** (drag-drop). Crossword lib license to verify at adoption.
5. ~~**Offline TTS / audio**~~ DEFERRED. Web Speech API covers listening (Q3). Only revisit
   (Piper TTS) if a fixed voice is ever required for formal tests.
6. ~~**English NLP for exercise generation**~~ DEFERRED (teacher's call). Was: libraries to
   validate AI-generated grammar items deterministically (tense/voice/POS/clause). Not
   needed now — worksheet answer-keys are checked in review + the confirm step. May return
   IF generated grammar keys prove unreliable; a WASM grammar checker client-side would be
   the TS-native path then.
7. ~~**Calendar UI components**~~ RESOLVED: **`@svar-ui/react-calendar`** (MIT) in the
   local companion app. FullCalendar avoided (GPL/commercial). The published static site
   remains framework-free.
8. ~~**Existing lesson-plan generators / EFL frameworks**~~ RESOLVED — prior-art scan done
   (§5.7): k12-teacher-skills (Apache-2.0) is the pattern to mirror.
9. **English operator list + exam Bewertung model** (feeds `test-generator`, §5.6).
   The grading law is already grounded in `docs/rules/leistungsbewertung-lsa-2012-2023.md`
   (RdErl. 2-83200) — do NOT re-research it. Remaining gaps only, from `bildung-lsa.de`:
   - Saxony-Anhalt English **operator list** (Operatoren mapped to AFB I–III) for tagging
     Klassenarbeit tasks.
   - **Realschulabschlussprüfung Englisch** task formats + Bewertung/points scheme per
     skill (listening/reading/writing/mediation) — authoritative model grade-7 tests
     build toward; and the grade-8 **Vergleichsarbeit Englisch** as nearest instrument.
   - Optional: the Lehrplan **Grundsatzband** for any general Leistungsbewertung wording.
   Entry hub (teacher-supplied):
   `https://lisa.sachsen-anhalt.de/schulqualitaet/pruefungen-zentrale-leistungserhebungen`
   Note: grade 7 has NO central exam (central instruments: grade 6 zentrale KA, grade 8
   Vergleichsarbeit, grade 10 Realschulabschlussprüfung). Record exact titles/dates/URLs.

Output of the research pass: a `docs/spec/05-research-findings.md` table plus a
recommended stack decision that resolves the open questions above.

## 5.4 Out of scope (v1)

- Student accounts, login, grade book of record, LMS integration.
- Real-time collaboration / multi-teacher editing.
- Automatic grading of free-text student answers.
- Mobile apps. (Responsive HTML is enough.)

## 5.5 Raised concerns not yet decided (parked, revisit before Phase 3)

These were flagged in review; no decision taken yet. Listed so they aren't lost.

- **Sequence — resolved, calendar/scaffold-first is correct.** Earlier review flagged
  "generation quality is the risk, so build it first." Rejected: text/exercise generation
  is a commodity, not the risk. The differentiating value and the precondition for
  generation to be worth anything is the year-scaffold + prior-content continuity (see
  §Design principles). Testing generation in isolation proves nothing because
  material-that-ignores-the-sequence is the failure mode, not the success case.
  **But the Phase-1 spike IS now a gate with a kill threshold** (see Success & kill
  criteria below) — scaffold-first does not mean build-blind.

- **Success & kill criteria (added after review).** The founding claim ("the context
  envelope beats ad-hoc prompting") must be checkable, else we could build through Phase 4
  and never know it worked. Define:
  - *Success signal:* on the Phase-1 spike + Phase-3 output, the teacher accepts generated
    worksheets (correct answer keys, controlled vocab respected, age-appropriate) without
    major rework at a target rate (teacher sets the bar, e.g. ≥80% usable as-is), AND the
    context-fit is visibly better than a same-prompt ad-hoc baseline the teacher compares
    against once.
  - *Kill/pivot threshold:* if the Phase-1 spike's worksheet quality is poor even with
    correct context, PAUSE further scaffold build and re-open the sequence decision before
    investing Phases 2–4. The do-nothing baseline (teacher prompts an LLM per lesson) is
    the thing to beat; re-compare against it at the Phase-1 and Phase-3 checkpoints.
    (Concrete metric definitions deferred to ce-plan.)
- **Item bank vs. per-date generation.** The durable, compounding asset is a tagged,
  reusable exercise bank (by competence + difficulty + vocab set), with lessons
  *assembling* from the bank and only generating gaps. Current spec generates per date.
  Decide whether to introduce a bank in Phase 3/4.
- **Human-in-the-loop + edit format.** Teachers always tweak. HTML is a poor hand-edit
  format; prefer per-exercise Markdown/JSON source rendered to HTML, plus an
  approve/regenerate/edit step before material is "usable". Not yet in the pipeline.
- ~~**Assessment depth.**~~ RESOLVED — the `klassenarbeit` skill (§5.6) now fully specs
  Erwartungshorizont + Notenschlüssel + written/oral weighting, grounded in the Erlass.
- **Differentiation — confirmed first-class** (Erlass §7.1–7.2 Nachteilsausgleich is
  legally required; k12-teacher-skills ships it as a separate skill). Implement as tiered
  variants / gestufte Lernhilfen, not a single `difficulty` flag. Mechanics → ce-plan.
- **Reading-text copyright.** Own AI-generated texts are safe but less authentic;
  conscious call needed on authenticity vs. legality per material.
- **Calendar auto-projection over-build.** Keep projection advisory with trivial manual
  override; do not over-invest in automated re-planning before the teacher validates it.
  Note: lesson scheduling (lesson_slots via companion UI) and module projection
  (weekly_lessons) are now explicitly decoupled — projection stays deterministic and
  independent of the interactive calendar.

## 5.6 Test-generator skill (`klassenarbeit`)

A skill separate from lesson-material generation (§4.2), because German assessment has
its own legal rules and its own artifact shape. Assessment rules are NOT in the
Fachlehrplan (verified — no Leistungsbewertung/Note/Klassenarbeit terms in the source).
They are set by a state Erlass with some values delegated to the school's Gesamt-/
Fachkonferenz, so the skill reads **config, never hardcodes**.

### Grounding source

- `docs/rules/leistungsbewertung-lsa-2012-2023.md` — extracted citable text of the
  **RdErl. des MK Sachsen-Anhalt vom 26.6.2012 – 2-83200** (Leistungsbewertung ...
  Sekundarstufen I und II), SVBl. LSA 2012 S.103, last amended 08.11.2023, Gliederungs-Nr.
  22311. Amtliches Werk, gemeinfrei (§5 UrhG). Source of the grading rules below.
- `docs/rules/rsa-englisch-pruefung-und-afb.md` — AFB I/II/III definitions + RSA Englisch
  exam structure, task formats, target text types and Bewertung principles (from LISA
  exam Hinweise + NbA). Source of `skill_formats`, AFB tagging, and text-type coverage.

Every value in `rules.yaml` below cites its section in these two files. Note: the
**niveaubestimmende Aufgaben are copyright-protected (LISA)** — pointer only, tasks are
never copied into the repo. Per-year Musteraufgaben/point-schemes are fetched on demand
from the Bildungsserver when building an actual test, not stored.

### What the Erlass fixes (grade 7 English, Sekundarschule, Realschule track)

- **AFB representation** (§4.1.1): tasks span Anforderungsbereich I/II/III, **Schwerpunkt
  II**; orient on niveaubestimmende Aufgaben; refer to prior teaching only.
- **Count** (§4.1.3): Kernfach (Deutsch/Englisch/Mathe) grades 5–10 = **min. 2
  Klassenarbeiten/year**. Exact number Fachkonferenz-set (§3.1, §4.1.3).
- **Parallel arbeit** (§4.1.4): grades 5,7–9 — at least one KA per grade written with
  identical tasks across all classes for comparability.
- **Duration** (§4.1.7): grade 7 = **min. 45 min** (90-min KA only required from grade 8).
- **Weighting into term grade** (§4.1.10): KA grades count **25–40 %** of the term grade;
  **in modern foreign languages, if only ONE KA, weighting ≤ 20 %**.
- **Notenschlüssel** (§6.3): statewide default table below; teacher may deviate for
  higher/lower demands. This is authoritative, not a placeholder.
- **Required artifacts** (§4.1.16): Aufgabenstellung, **Erwartungshorizont** and
  **Bewertungsschlüssel** are mandatory and kept until end of next school year.
- **Sprachkompetenz** (§4.1.13): correction includes language quality in every subject.
- **Announce/limit** (§4.1.2): announce ≥1 week ahead; max 1 KA/day, 3/week per pupil.
- **2/3 rule** (§4.1.17): if < 2/3 of pupils reach ≥ Note 4, review before returning;
  Schulleitung decides whether it counts or is repeated.
- **Nachteilsausgleich** (§7.1–7.2): legally required for Förderbedarf and diagnosed
  learning disorders (more time, differentiated tasks, verbal assessment, etc.) — this
  is the legal grounding for treating differentiation as first-class (§5.5).

### Config

```yaml
# assessment/rules.yaml   — every value cites docs/rules/leistungsbewertung-lsa-2012-2023.md
class: 7a-2025-realschule
klassenarbeiten_per_year: 2          # §4.1.3 statewide floor for Kernfach; raise per Fachkonferenz
klassenarbeit_min_minutes: 45        # §4.1.7 (grade 7)
afb_focus: II                        # §4.1.1 Schwerpunkt Anforderungsbereich II
afb_spread: [I, II, III]             # §4.1.1 all three represented, no fixed % in Erlass
term_grade_weight_pct: [25, 40]      # §4.1.10 range; special: <=20 if only one KA in modern FL
notenschluessel:                     # §6.3 statewide default (teacher may deviate)
  - { min_pct: 93, grade: 1 }
  - { min_pct: 75, grade: 2 }
  - { min_pct: 60, grade: 3 }
  - { min_pct: 40, grade: 4 }
  - { min_pct: 20, grade: 5 }
  - { min_pct: 0,  grade: 6 }
required_artifacts: [aufgabenstellung, erwartungshorizont, bewertungsschluessel]  # §4.1.16
include_language_quality: true       # §4.1.13
nachteilsausgleich: true             # §7.1–7.2
afb_source: docs/rules/rsa-englisch-pruefung-und-afb.md   # AFB defs; no discrete operator list exists
skill_formats: [listening, reading, language_in_use, mediation, writing]  # RSA exam parts
listening_formats: [multiple_choice, multiple_matching, table_completion, sentence_completion, short_answer, note_taking]
reading_formats:   [multiple_choice, multiple_matching, table_completion, sentence_completion, short_answer, note_taking, true_false_justification]
writing_min_words: 150            # RSA writing task 2; scale down for grade 7
writing_scored_on: [inhalt, textgestaltung, sprachqualitaet]
```

Inputs: a milestone's lesson-spec (competences to assess, all `prior_covered` up to the
test date), the class curriculum band, the controlled vocabulary (§3.6), and
`rules.yaml`. The projection engine (§02) already guarantees every assessed competence
was taught before the test date.

Outputs (one dated artifact set):
- `klassenarbeit.html` — the test, tasks tagged by skill area, using only known vocab,
  each task labelled with its **Anforderungsbereich (AFB I–III)**, Schwerpunkt II.
- `erwartungshorizont.html` — expected answers + per-task points, AFB and competence-ID
  tagged, with the §6.3 `notenschluessel` applied to show grade boundaries.
- Two renderings (student copy / teacher copy) from one Markdown/JSON source.

Assessment is now fully grounded in `docs/rules/` (grading law + AFB + exam structure)
and `docs/spec/06-exercise-design-reference.md` (task formats + design criteria). No
open research dependency; only per-year, copyright-protected Musteraufgaben are fetched
on demand at test-build time, never stored.

## 5.7 Prior art (verified) and resulting adjustments

Full scan in `docs/spec/research/00-prior-art.md`. Three load-bearing repos were
independently verified to exist with the reported profile; the rest are agent-reported
and not yet re-checked.

### Verified, directly relevant
- **anthropics/k12-teacher-skills** (official Anthropic; ~140★) —
  https://github.com/anthropics/k12-teacher-skills . Ships `k12-lesson-planning` +
  `k12-lesson-differentiation` skills (standards-aligned, tiered below/at/above
  proficiency) with an `evals/` framework and plugin/MCP packaging.
  → ADOPT: study its skill structure and evals as the pattern for our lesson + exercise
    skills. Confirms **differentiation as a first-class, separate skill** (matches our
    §5.5 concern and the Erlass Nachteilsausgleich requirement). Reuse the eval harness idea.
- **FWU-DE/lehrplan-ontologie** (~5★ but substantial; OWL/TTL, SPARQL, SHACL, per-state
  files) — https://github.com/FWU-DE/lehrplan-ontologie . Machine-readable German
  curricula across Bundesländer.
  → NOT used as the Component A source (BFO overhead — see Decisions log + §3.1). Kept
    only as a low-priority comparison/validation check; ask the author (a known contact)
    whether ST English coverage matches our extraction. Comparison task below.
- **cassproject/CASS** (~60★; xAPI, IMS CASE, CTDL-ASN, Open Badges) —
  https://github.com/cassproject/CASS . Competency-framework + attainment tracking.
  → DESIGN-AWARE: keep our coverage model (§3.7) mappable to CASE/xAPI competency-
    attainment vocab for later interop. Do not adopt now; avoid over-engineering.

### Agent-reported, not yet verified (treat as leads)
teaching-skills (backward-design sequence), education-agent-skills (YAML skill chaining),
Lumi-AI-Editor (AI + H5P authoring), codebase-to-course (self-contained HTML export
pattern), classroomio (OSS LMS), school_days (calendar math), lp21_parser (Swiss Lehrplan
scraper), EduBase/MCP. Verify before citing as fact.

### Novelty check
No single project found combines deterministic school-year **calendar projection** +
**bidirectional depth-aware coverage ledger** feeding the next lesson. The pieces exist
separately (ontology, calendar math, competency tracking, lesson-gen skills); the
integration is our contribution. Treat as "differentiated, not unprecedented" — the parts
are proven, which lowers build risk.

### Real risks it surfaced (accept)
- Depth encoding (introduced vs practiced vs produce) is subjective — needs a rubric, not
  vibes. Resolution: the generator assigns depth deterministically from exercise TYPE +
  count (e.g. a production task advances `produce`; one recognition task is `introduced`),
  teacher may override. Recorded in §3.7.
- No classroom pilot data yet; teacher refinement-loop UX unproven. → the confirm step
  (§4.6.3) and the Phase-1 spike are the cheapest ways to get early signal.

### Deep-dive follow-up (k12-teacher-skills + lehrplan-ontologie)

- **k12-teacher-skills is Apache-2.0** and structured as `plugin/` (skill content + teacher
  MCP servers) + `evals/` (framework + rubrics). It plugs a **standards knowledge graph**
  (Learning Commons KG, US standards) into a `lesson-planning` skill + a
  `lesson-differentiation` skill + evals. That architecture is isomorphic to ours:
  (lehrplan-ontologie) → (prepare-lesson/generator) + (differentiation) + (eval harness).
  Anthropic independently arrived at the same shape → strong validation. Our net additions:
  calendar projection, coverage ledger, German assessment grounding, offline static
  artifacts. ADOPT: mirror the plugin+evals layout; read their SKILL definitions before
  authoring ours.
- **lehrplan-ontologie confirmed to include Saxony-Anhalt** (`lp-land-ST-full.owl`, all 16
  states) but is **BFO-based** — decided NOT to use as the Component-A source (overhead;
  see Decisions log). Our own flat typed extraction (§3.1) is the source.

**TASK — ontology comparison (low priority, validation only).** Compare the ST English
entries in `lehrplan-ontologie` against our extracted schema (§3.1): does the ontology's
coverage/granularity match what we pulled from the Lehrplan? Use it to (a) sanity-check
our extraction for gaps/errors, (b) optionally borrow stable IRIs *as aliases* if trivial.
Not a source dependency. The author is a known contact — a direct question may be faster
than diffing OWL. Blocked on nothing; do when convenient.

## 5.8 ce-doc-review outcomes (2026-07-24)

4-persona Sonnet review (coherence, feasibility, scope-guardian, adversarial). Raw
findings in `docs/spec/research/` transcripts; catalogued drift in `consistency-notes.md`.

**Applied to the spec:**
- Coverage depth reframed as EXPOSURE not mastery, with a teacher-set `mastered` override; gap report states the limitation (§3.7). We collect no pupil answers, so auto-mastery is impossible.
- Required artifact-review step added between generate and publish (§4.5–4.6): teacher checks worksheets + answer keys before push.
- Success + kill criteria added; the Phase-1 spike is now a gate, not just a check (§5.5).
- Component A reclassified as two-stage — deterministic table mapping + AI-assisted semantic decomposition with human review before IDs freeze (§3.1, §00). The "pure deterministic parser" claim was false.
- Controlled-vocab leveling check upgraded from optional to REQUIRED before the allow-list is accepted (§3.6a); false "deterministic seed" claim dropped, committed git file is source of truth.
- Milestone slot-shift constrained forward-only to preserve taught-before-test (§02).
- Mechanical fixes: Phase 3 skill list aligned to first-build set; `block`→`module`; stray `produce` removed from depth ladder; `in_weeks`→`in_slots`; `weekly_lessons` canonical + sync check; `known_vocab_ref` suffix clarified; Open-Q4 resolved; §3.6/§3.7 subheadings; stale §4.1 SPA text and §5.7 ontology-as-source bullet corrected.

**Skipped (teacher's call):**
- Independent cross-check of the agent-proposed grade 5/6 split — for v1 the teacher's own review suffices (revisit if it proves error-prone).

**Deferred to ce-plan:**
- Trim the multi-band/track folder scaffold in §3.1 to only in-scope files (scope-guardian 9a).
- Right-size / defer the k12-style `evals/` harness until multiple teachers or a quality-regression problem exists (scope-guardian 9b).
- Concrete metric definitions for the success/kill criteria (§5.5).
- FYI-tier notes: depth state-machine vs simpler flag; skill registry vs fixed set; a batch/ahead-of-time generation mode for time-pressured prep; review-labor as the real "product later" bottleneck.
