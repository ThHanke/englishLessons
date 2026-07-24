# Data Model

All files live in the repo, versioned. Formats: YAML for human-edited config,
JSON for machine-generated exports, Markdown for prose curriculum sources.

## 3.1 Curriculum model (Component A) — one purpose-built extraction, not an ontology

Parsed **once** from `docs/lecture_plans/<state>-<schooltype>-<subject>-<version>.md`
into a flat, typed schema built for *our* needs — no upper ontology. Every piece of
information in the source is captured as a typed entry, tagged by where it is consumed,
with provenance. This decouples downstream artifacts from the prose so everything cites
stable IDs.

**Why not the BFO-based ontology as source:** [FWU-DE/lehrplan-ontologie] is BFO-grounded
(upper-ontology classes, OWL/SPARQL toolchain) — heavy interoperability machinery we do
not need to build modules, plan lessons, and generate material. We keep our own flat
schema and use the ontology only as an optional *comparison/validation* check (roadmap
§5.7 task), not as a runtime dependency.

**Entry types** (each carries `id`, `source` = doc + location, and `used_in` tags from
`{module_construction, lesson_planning, base_material, test_generation}`):

| Type | Fields | Origin | Primary `used_in` |
|------|--------|--------|-------------------|
| `competence` | skill_area, statement, mode (understand/produce) | extracted | module, lesson, test, coverage |
| `grammar_item` | topic, mode | extracted | module, lesson, exercise, test |
| `content_field` | field, text (topic) | extracted | module, lesson |
| `text_type` | name, receptive/productive | extracted | lesson, exercise, test |
| `vocabulary` | words[] per module/topic | **derived** (agent, §3.6a) | base_material, lesson |
| `task_pattern` | format, afb, skill_area, *pointer only* (no NbA text — copyright) | referenced | exercise design, lesson |
| `hint_method` | text (gute-Aufgaben criteria, Texterschließung, methodical comp.) | extracted/referenced | lesson, exercise design |
| `reference` | citation (curriculum §, Erlass §, textbook) | extracted / teacher-supplied | provenance everywhere |

`competence`, `grammar_item`, `content_field`, `text_type` are the structured form of
"teaching goals + topics" — kept typed (not prose) because coverage/depth (§3.7) tracks
them. `vocabulary` is generated, never in the source verbatim. `task_pattern` stores only
format/AFB pointers, never protected task text (§06, `material/` licensing rule).

The stable competence graph (below) is the projection of the `competence`/`grammar_item`
entries; the other entry types hang off the same extraction.

```
curriculum/
  sachsen-anhalt-sekundarschule-englisch-2019/
    meta.yaml            # state, school type, subject, valid_from, source_file, cefr targets
    grade-bands/
      5-6.yaml            # in scope (Phase 0)
      7-8-realschule.yaml  # in scope (Phase 0) - grade-7 portion; grade-8 modules additive later
      # 7-8-hauptschule.yaml, 9-10-realschule.yaml, 9-hauptschule.yaml: out of scope for now
      #   (Hauptschule track, grades 8-10) - additive later, not created in Phase 0 (scope
      #   finding 9a). Extending the folder with these files is a non-breaking addition.
```

**In-scope bands (grades 5–7):** `5-6.yaml` + the grade-7 portion of `7-8-realschule.yaml`
(**grade 7 = Realschule track only**; Hauptschule out of scope). Bands ≠ school years:
the single **5/6 band spreads across two year-plans** (grade 5, grade 6) as a spiral; the
**7/8 band feeds the grade-7 year-plan** (grades 8/9/10 out of scope for now but the
files exist, so extending later is additive). `cefr_target` is band-level: 5/6 ≈ A1→A2,
7/8 RS on the path to B1, 7/8 HS on the path to A2.

The 5/6 band gives competences for the whole two-year span without naming the year, so
the **module derivation also allocates each competence to grade 5 or grade 6** (agent-
proposed draft, teacher-refined — same pattern as clusters/vocab), respecting
prerequisite order (e.g. simple present before simple past) and spiral progression:
grade 5 ≈ foundations, grade 6 ≈ extension. This year-split is our decision, recorded in
the plan, not taken from the Lehrplan.

Each grade-band file:

```yaml
id: sa-sek-en-2019.7-8.rs
grades: [7, 8]
track: realschulabschluss
cefr_target: B1            # end of grade 10
competence_areas:
  funktional_kommunikativ:
    kommunikativ:
      - id: fk.k.hoer.1
        skill: listening
        text: "einfache und komplexere Äußerungen ... verstehen"
      - id: fk.k.lesen.1
        skill: reading
        text: "Hauptaspekte einfacher authentischer Texte verstehen"
      # ... speaking, writing, mediation
    sprachliche_mittel:
      grammatik:
        - id: fk.g.passive
          topic: "active and passive voice"
          mode: [understand, produce]
        - id: fk.g.present_perfect
          topic: "simple present perfect"
        - id: fk.g.conditional_1
          topic: "conditional clauses I"
          mode: [understand, produce]
        - id: fk.g.conditional_2
          topic: "conditional clauses II"
          mode: [understand]
        - id: fk.g.relative_clauses
        - id: fk.g.gerund
        - id: fk.g.modals
        - id: fk.g.adverbs
      wortschatz: [ ... ]
      aussprache: [ ... ]
      orthografie: [ ... ]
  interkulturell: [ ... ]
  methodisch: [ ... ]
content_fields:            # kommunikative Inhalte
  - id: c.social.freizeit
    field: soziales_umfeld
    text: "Freizeit, Schulsysteme, Kultur, Medienfunktionen"
  - id: c.alltag.institutionen
text_types:
  receptive: [sketch, erzaehlung, prospekt, gebrauchsanweisung, film_clip]
  productive: [online_formular, blog_post, blog_comment, interview, storyboard,
               dialog, bericht, beschreibung, erzaehlender_text]
```

Extraction is **two-stage, not a pure deterministic parse**:
1. *Deterministic table mapping* — read the Markdown table structure into raw rows.
2. *AI-assisted semantic decomposition* — split bundled prose into per-item, per-mode
   entries. This is required because the Lehrplan packs several items with different modes
   into one bullet (e.g. "…verstehen (*conditional I und II, relative clauses*) und
   formulieren (*conditional I, relative clauses*)" → three grammar_items, two modes), and
   the phrasing is inconsistent across bands. A regex/table-reader cannot do this reliably.

Because stage 2 is AI-assisted, **IDs are frozen only after human review** of the emitted
entries; they are not "deterministically re-parseable" and must not be silently
regenerated. Treat the reviewed, git-committed `curriculum/**.yaml` as the source of
truth; a re-extraction produces a draft to diff against it, never an overwrite. A manual
override file is allowed for fixups.

**Preferred source (evaluate in Phase 0):**
[FWU-DE/lehrplan-ontologie](https://github.com/FWU-DE/lehrplan-ontologie) publishes
German curricula for **all 16 Bundesländer** as a machine-readable ontology (OWL/TTL,
SPARQL, SHACL, per-state files — Saxony-Anhalt confirmed present as `lp-land-ST-full.owl`).
Consumed via RDF/SPARQL → emit our competence YAML (no native JSON). The author is a
known contact of the maintainer of this project, so coverage/granularity questions go
directly to them rather than reverse-engineering OWL.

Open confirmations before committing (ask the author):
1. Does ST cover **Englisch, Sekundarschule, grades 5–10** (Real + Haupt tracks)?
2. Do individual can-do competences carry **stable IRIs** we can cite, or only
   subject/grade-band granularity?
3. Is the **2019 Fachlehrplan** the modeled version; how are updates versioned?
4. Reuse/redistribution **license** for derived competence data.
5. SPARQL endpoint / JSON export, or consume TTL directly.
6. Openness to us **contributing SA English** if thin / collaborating.

If 1+2 hold, this **replaces the PDF parser** for Component A and delivers multi-state
"product later" for free — the biggest single de-risk. Fallback stays the deterministic
Markdown parser above. See roadmap §5.7.

## 3.2 Year-plan template (Component B) — modules = curriculum-derived clusters

A module is a **cluster of topics + goals + a target set of competences** with required
*depth*. Modules are **derived from the curriculum** (an extraction step groups content
fields, grammar and skills into coherent topic clusters — draft), then teacher-edited
and sequenced. Same derive-then-refine pattern as the auto-generated vocab (§3.6a). The
target competences with their required depth are what the coverage ledger (§3.7) tracks
lessons against.

Expressed in *ideal teaching weeks* (not calendar dates); the projection maps to time.

```
plans/
  7a-2025-realschule/
    class.yaml           # name, grade, track, curriculum ref (weekly count lives in modules.yaml)
    modules.yaml         # derived from curriculum, then teacher-edited
```

```yaml
# modules.yaml
class: 7a-2025-realschule
curriculum: sa-sek-en-2019.7-8.rs
total_weeks: 38                 # nominal teachable weeks; projection may compress
weekly_lessons: 3
modules:
  - id: m1
    title: "Back to school / Free time"
    weeks: 5
    content_fields: [c.social.freizeit]
    goals:
      - "Talk about free-time activities using present perfect"
    covers:                     # target competences + the DEPTH required by end of module
      - { id: fk.g.present_perfect, required_depth: produce }   # produce | understand
      - { id: fk.k.sprechen.1,      required_depth: produce }
    milestone:
      type: test                # test | project | presentation | none
      grade_weight: 1.0
      assesses: [fk.g.present_perfect, fk.k.schreiben.1]
    pedagogy:
      repetition_ratio: 0.3     # share of time on review vs new input
      new_grammar: [fk.g.present_perfect]
  - id: m2
    title: "The UK — regions and life"
    weeks: 6
    content_fields: [c.social.freizeit]
    covers: [fk.i.orientierung.uk, fk.g.relative_clauses]
    milestone: { type: test, grade_weight: 1.0, assesses: [fk.g.relative_clauses] }
# ... modules must sum ~ total_weeks, leaving slack buffer
buffer_weeks: 3                 # absorbed by holidays/events/pace loss
```

Constraint checks (deterministic, run on save):
- Every `covers`/`assesses` ID exists in the referenced curriculum band.
- Every productive grammar competence marked `produce` in curriculum is covered by
  at least one module before its assessing milestone (coverage lint).
- `sum(module.weeks) + buffer_weeks == total_weeks` (± tolerance).
- `weekly_lessons` in modules.yaml is canonical for the weekly count;
  `len(calendar.class_schedule[class].lesson_days) == weekly_lessons` (keeps the calendar,
  the plan, and the projection budget math in sync).

## 3.3 School-year calendar (Component C)

Concrete German school year for one federal state and year. The `holidays[]` block is
**fetched once from OpenHolidaysAPI and cached into this file** (no runtime API
dependency; offline thereafter) — see `research/04-ferien-data.md`. Verified endpoint:
`GET https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-ST&validFrom=…&validTo=…`
returns school-holiday periods with `startDate`/`endDate`/`name`. Public holidays come
from the sibling `/PublicHolidays` endpoint. **School-specific events** (Projektwoche,
Sportfest, Wandertag, bewegliche Ferientage) are NOT in the API — the teacher enters
them under `events[]`.

```
calendar/
  sachsen-anhalt-2025-2026.yaml
```

```yaml
state: sachsen-anhalt
school_year: 2025/2026
first_school_day: 2025-08-11      # after summer break
last_school_day: 2026-07-17
holidays:                         # no lessons
  - { name: Herbstferien, from: 2025-10-13, to: 2025-10-25 }
  - { name: Weihnachtsferien, from: 2025-12-22, to: 2026-01-03 }
  - { name: Winterferien, from: 2026-02-02, to: 2026-02-07 }
  - { name: Osterferien, from: 2026-03-30, to: 2026-04-06 }
  - { name: Pfingstferien, from: 2026-05-15, to: 2026-05-26 }
events:                           # reduce or block teaching capacity
  - { name: Projektwoche, from: 2026-06-08, to: 2026-06-12, capacity: 0.0 }
  - { name: Sportfest, date: 2026-05-28, capacity: 0.0 }
  - { name: "Wandertag", date: 2025-09-25, capacity: 0.0 }
pace_factors:                     # pedagogical throughput modifiers
  pre_holiday_days: 2             # last N school days before a holiday
  pre_holiday_factor: 0.6         # ~40% less new material absorbed
  post_holiday_days: 2
  post_holiday_factor: 0.8
class_schedule:
  7a-2025-realschule:
    lesson_days: [Mon, Wed, Fri]  # which weekdays this class has English
```

## 3.4 Lesson spec export (Component E output)

Produced for a single picked date; the contract handed to the generator. **Fully
deterministic** (computed from projection + curriculum + coverage, no AI), so the static
planning site (§4.1) pre-computes and embeds every day's spec at build time for view/copy.

```json
{
  "class": "7a-2025-realschule",
  "date": "2026-01-14",
  "school_week": 21,
  "module": { "id": "m5", "title": "Media and me", "week_in_module": 2, "of": 4 },
  "phase": "new_input",
  "pace_factor": 0.8,
  "pace_reason": "second lesson after Weihnachtsferien",
  "focus_competences": [
    { "id": "fk.g.conditional_1", "topic": "conditional clauses I", "mode": ["understand","produce"] }
  ],
  "content_field": { "id": "c.social.freizeit", "text": "Media functions: information, entertainment" },
  "text_types": ["blog_comment", "dialog"],
  "milestone_context": { "next": "test", "in_slots": 2, "assesses": ["fk.g.conditional_1"] },
  "prior_covered": ["fk.g.present_perfect", "fk.g.relative_clauses"],
  "cefr_target": "B1",
  "known_vocab_ref": "7a-2025-realschule@m5",
  "textbook_refs": [],
  "suggested_exercise_types": ["gap_fill", "tense_id", "reading_comprehension"],
  "curriculum_ref": "sa-sek-en-2019.7-8.rs"
}
```

## 3.6 Controlled vocabulary + textbook references (license-clean layer)

German teachers legally choose their own materials and are not bound to one book, but
schools do buy a textbook (Lehrwerk). We must **never ingest or reproduce copyrighted
textbook content.** Instead the tool owns its own vocabulary model and treats the book
as a citation only. This keeps everything license-clean and, as a bonus, textbook-
agnostic — which is what makes "personal now, product later" viable without per-book
licensing.

Three parts:

### 3.6a Owned controlled vocabulary — agent-generated from the curriculum

No manual authoring, no prior knowledge required. The lexis a pupil has met by the end of
each module is fully determined by that module's curriculum categories (content fields +
grammar progression + text types). So an agent generates the per-module expected-vocab
list by role assignment ("you are a SA grade-7 English teacher; list the productive +
receptive lexis a pupil has met by end of module N, given these content fields, this
grammar, these text types"). No textbook, no hand-built word list.

Because this list becomes a **hard allow-list** gating every future worksheet's language,
it must be validated before use, not trusted from one pass: a **required leveling check**
(a frequency/graded wordlist, or a second automated CEFR-level pass) flags words above the
expected band for teacher review before the list is accepted. Generation runs once per
plan and the result is **git-committed as the source of truth** — there is no reproducible
"seed"; a regeneration produces a draft that must be diffed against the committed file
before it can overwrite it (never a silent overwrite).

```
vocabulary/
  7a-2025-realschule.yaml      # generated artifact, teacher-editable
```

```yaml
class: 7a-2025-realschule
inherits_from: grade-6              # predecessor plan whose full cumulative vocab is pre-known
cumulative: true                   # this file lists only lexis NEW at this grade (never re-lists inherited words)
generated_from:
  curriculum: sa-sek-en-2019.7-8.rs   # content fields + grammar + text types per module
  method: agent-role-assignment       # committed file is source of truth; regen = draft to diff, no seed
required_leveling:
  frequency_list: ngsl-1.2            # REQUIRED validation pass — flags words above expected CEFR band
modules:                              # agent output; words become "known" as modules advance
  m1: [free time, hobby, once a week, ...]
  m2: [region, countryside, ...]
taught_through: m4                    # teacher-set marker of actual progress (drives known_vocab)
overrides: { add: [ ... ], remove: [ ... ] }   # teacher corrections, optional
```

**Cross-grade progression (chained).** Vocabulary is not independent per grade — it chains
5 → 6 → 7 via `inherits_from`, so a pupil's known lexis accumulates monotonically across school
years exactly as the coverage model accumulates competences (`prior_covered`, §3.4/§3.7). Rules:

- **Single canonical introduction.** Every word is introduced exactly once in the whole chain,
  at its first (grade, module). A later grade never re-lists a word already known via its
  inheritance chain (no re-introduction) — enforced by a validator over the committed files.
- **Sequential cumulative generation.** Each grade's list is generated with the frozen cumulative
  vocabulary of all predecessor grades supplied as "already known, exclude", so it proposes only
  new-at-this-grade lexis. Generation is chain-ordered: grade 5 (no inheritance) frozen before
  grade 6 generates, grade 6 frozen before grade 7. This keeps the whole 5–7 vocabulary
  consistent and de-duplicated.
- **5/6 band special case.** Grade 6 sets `inherits_from: grade-5` while both point at the same
  `sa-sek-en-2019.5-6` curriculum — correct, because that single band legitimately spans two
  school years (§3.1 grade-split).

`known_vocab_ref` in the lesson spec resolves to the union of all module lists **across the
`inherits_from` chain** — every predecessor grade in full, plus the current grade up to
`taught_through` — plus overrides. The `@<module>` suffix in the ref (e.g. `…@m5`) is a
lookup label for the current lesson only; the vocabulary cutoff always comes from
`taught_through`, independent of the suffix. The generator (G) and exercise skills (H)
treat the resolved set as a hard allow-list for target/new vocabulary; unavoidable new
words are surfaced as a pre-taught glossary, never silently used. This is what makes "a lesson
may only use previously-introduced vocabulary" enforceable — the allow-list is the chained
cumulative set, so no grade can suddenly use lexis a pupil has not met.

### 3.6b Textbook references — teacher-supplied per lesson, citation only

No `textbook_map` of guessed units is maintained. During the `prepare-lesson` conversation
(§4.6), after the plan is drafted, the orchestrator asks the teacher which references to
include; the teacher gives a plain citation and it is stored *in that lesson's artifact*:

```json
"textbook_refs": [ { "book": "Green Line 3", "citation": "S. 45, Aufgabe 1.4", "slot": "practice" } ]
```

Only the citation string is ever stored — never book text. Citations are not copyrighted
content, so lesson artifacts stay safe to publish (§4.7).

### 3.6c Rendered as a teacher-directed step

The lesson plan renders each ref as
"do S.45/1.4 from your book here". Each material slot offers two paths: a generated
interactive widget, or a teacher-supplied textbook citation the teacher works from their
own copy.

## 3.5 Artifact registry (Component I)

```
artifacts/
  7a-2025-realschule/
    2026-01-14/
      lesson-spec.json
      lesson-plan.html
      materials/
        01-gap-fill-conditionals.html
        02-reading-media.html
        index.html            # bundles materials, links back to date in web tool
      manifest.json           # {date, module, generated_at, source_spec, files[], covered[] (§3.7a), topics[], vocab_introduced[]}
```

The web tool (F) reads `manifest.json` files to show, per calendar date, which
artifacts exist and link to them.

## 3.7 Coverage model — forward clusters, reverse ledger, gaps

Bidirectional. Forward: modules (§3.2) declare target competences with required depth.
Reverse: every generated lesson records what it *actually* covered; aggregating those
records gives real, bottom-up coverage. Gaps = target − actual, depth-aware. All
deterministic and file-based; the ledger is *derived*, never hand-maintained.

**Coverage depth = EXPOSURE, not mastery.** This is a load-bearing caveat. The ledger
records that a competence was *taught/practised at a given level*, NOT that pupils mastered
it — the tool collects no pupil answers (no backend, no student data, §5.4). Widgets
self-check in the browser; nothing reports back. So depth is a taught-exposure signal, and
the gap report states this limitation on its face. The teacher can **manually mark a
competence `mastered`** (an override) when their own assessment says so; the automated
ledger never infers mastery.

**Coverage depth** (per competence, monotonic exposure state):

`planned → introduced → practiced → assessed`   (+ teacher-set `mastered` override)

`introduced` = first taught; `practiced` = exercised ≥ once more; `assessed` = appeared
in a milestone test. Required depth comes from the module's `covers[].required_depth`
(maps to the curriculum `mode`: `understand`→ practiced is enough; `produce`→ pupils
must produce, i.e. practiced with production tasks / assessed).

**Depth is assigned by rule, not vibes** (prior-art risk, §5.7). The generator derives a
lesson's exposure depth deterministically from the exercise TYPE + count: a recognition/
receptive task (MCQ, matching) → `introduced`; repeated or productive tasks (writing,
transform, dialogue) → `practiced`; appearance in a milestone → `assessed`. Reproducible,
but remember it measures exposure — the `mastered` state is teacher-set only.

### 3.7a Per-lesson coverage record

Written by the lesson generator into the manifest:

```json
"covered": [
  { "competence": "fk.g.conditional_1", "depth": "introduced", "via": ["gap_fill"] },
  { "competence": "fk.g.present_perfect", "depth": "practiced", "via": ["reading_comprehension"] }
],
"topics": ["media_functions"],
"vocab_introduced": ["broadcast", "headline", "..."]
```

### 3.7b Coverage ledger

Derived by folding every lesson's `covered` over the plan:

```
coverage/7a-2025-realschule.json    # generated; do not hand-edit
```
Per competence: max depth reached, list of dates/lessons touching it, exercise types
used. Per module: its target set × achieved depth = a coverage matrix and a
`% at required depth`.

### 3.7c Gap report

Target vs ledger, per module and for the year (all gaps are exposure-based, §3.7 caveat):

- **Uncovered:** target competence never touched.
- **Under-depth:** touched but below `required_depth` (e.g. needs `produce`, only
  `introduced`). This is the gap that bites — surfaced explicitly.
- **At-risk:** required by a milestone within N slots but not yet at needed depth.
- **Year gaps:** curriculum competences never reaching required depth by year end.

Consumers: the `prepare-lesson` orchestrator recall step (§4.6) biases the next lesson
toward uncovered/under-depth competences in the active module; the projection drift report
(§02) reports coverage drift alongside calendar drift; a year-end audit lists gaps.
