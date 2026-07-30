# English Lessons Companion

AI-assisted lesson planning for school teachers. An interactive calendar paired with a
chat companion that knows your curriculum, tracks what you've taught, and generates
lesson plans and exercise materials grounded in your syllabus.

Built for any school type, subject, and state curriculum — currently used for English
at a Sachsen-Anhalt Sekundarschule (grades 5–7).

## Getting started

### Prerequisites

- **Node.js 22+** (uses `--experimental-strip-types` for native TS execution)
- **Claude Pro or Max subscription** — the chat uses the Claude Agent SDK, which
  authenticates via your subscription (no separate API key needed)

### Setup

1. Clone the repo and install dependencies:
   ```sh
   git clone <repo-url>
   cd englishLessons
   npm install
   ```

2. Set up Claude authentication (one-time):
   ```sh
   claude setup-token
   ```
   Copy the printed token into the token file at:
   - Linux: `~/.config/english-lessons-companion/oauth-token`
   - macOS: `~/Library/Application Support/english-lessons-companion/oauth-token`
   - Windows: `%LOCALAPPDATA%\english-lessons-companion\oauth-token`

3. Start the companion:
   ```sh
   npm run dev
   ```
   Open <http://localhost:5199> in your browser.

4. Enable GitHub Pages (one-time, per repo): in the GitHub repo's
   **Settings → Pages**, set **Source** to **GitHub Actions**. No workflow file
   can flip this setting itself — it's a one-time manual step before the first
   `git push` will actually deploy anything.

## How it works

### 1. Extract the curriculum (one-time, per curriculum)

If your state/school-type/subject curriculum isn't already extracted under
`curriculum/<id>/grade-bands/`, run the `curriculum-decompose` skill against your
source Lehrplan document — see [Adapting to another curriculum](#adapting-to-another-curriculum)
below. Already done for Sachsen-Anhalt Sekundarschule English (grades 5–7) — you only
need this step again for a new curriculum, not per school year.

### 2. Map the curriculum onto this school year

For each grade you teach, `plans/<grade>/modules.yaml` sequences your curriculum's
competences into teaching modules (topic, goals, weeks, milestone). The
`module-derive` skill drafts this from your curriculum extraction; you review and
adjust weeks/pacing to fit the actual school year. Also one-time per grade — done
once, reused every year unless your module sequence changes. Vocabulary
(`vocabulary/<grade>.yaml`, chain-ordered so each grade excludes words already taught)
is generated the same way, via `vocab-generate`.

### 3. Set up lesson series in the calendar

The calendar shows all your grades as overlay layers, starting from the first school
week. To define when you teach each grade:

- **Drag** in day or week view, or click the **+** button
- Pick the grade, weekday(s)/time(s), and half-year (auto-detected from the school
  calendar)
- Appointments are created for every school day in that half-year, automatically
  skipping holidays, weekends, and blocked days
- A class with more than one lesson on the same day (double periods) just gets a
  second series for that slot — both appear as separate appointments on the same date

Schedules are saved to the calendar YAML file in the repo. **If your schedule
changes mid-year** (new timetable, room swap, whatever), edit the series directly —
open the appointment, "Edit lesson series," adjust — it updates that slot in place
rather than duplicating it. Past lesson dates and their generated content are
untouched by a reschedule.

### 4. Plan a lesson

- **Click an appointment** on the calendar — a context panel shows which curriculum
  module is active for that date, where you are in it, and what coverage gaps remain
  (see [What the companion knows](#what-the-companion-knows-and-generates) below)
- **Click "Plan lesson"** — a chat session opens, pre-loaded with all of that context
- The chat drafts objectives, a timed stage-by-stage plan, and the exercises/materials
  it intends to build, and asks you to confirm or adjust **before generating anything**
- **This is where you give additional input the companion can't infer on its own:**
  - Which textbook pages to reference (a plain citation like "S. 45, Aufgabe 1.4" —
    the tool never stores or generates actual book content, only the citation as a
    teacher-directed step)
  - Anything about the specific class (a pupil's IEP/accommodation, a topic to avoid,
    an activity that worked well or fell flat last time) — the companion only knows
    what's in the repo (specs, coverage ledger, vocabulary), not classroom context
  - Corrections to the draft plan's pacing, difficulty, or activity choices
- Once you approve, it saves the lesson spec, the structured plan, and generates each
  exercise/material file

### 5. Review before you publish

**Required, not optional.** Open the generated lesson-plan page and check the
worksheets and **answer keys** — not just the earlier chat outline. Nothing catches an
incorrect answer key or an ungrammatical item except you, before it's pushed to a
public URL pupils will use.

### 6. Publish

Generated materials live in the repo as self-contained HTML files. Push to publish:
```sh
git add .
git commit -m "lesson for 7a 2026-01-14"
git push
```
The push triggers the `pages.yml` Actions workflow, which builds `site/` (via
`npm run build:site`) and deploys it to GitHub Pages — watch progress under the
repo's **Actions** tab. Once deployed, Pages serves each lesson at a stable
`/classes/<class>/<date>/` URL. The files also work offline (`file://`, e.g. from the
companion's local artifact preview) and print cleanly.

### 7. Subscribing to the calendar

Each class has a downloadable/subscribable `.ics` file (click **View calendars**,
then **Subscribe** next to a class — or `calendars/<class>/<school-year>.ics` directly)
— share the `webcal://` link with pupils or parents so lessons show up in their own
calendar app (Google/Outlook/Apple Calendar).
Each entry includes:
- The lesson's actual topic once planned (not just the module name)
- A link to the lesson-plan page, and to homework/test pages when they exist
- The competences it covers, both in the description text and as RFC 5545
  `CATEGORIES` — most calendar apps let you filter/search by category, so a pupil can
  find every lesson that covered e.g. "Passive Voice" across the term
- Unplanned future dates still show up (so the schedule itself is visible), just
  without topic/links until you plan that lesson

One caveat: times are floating (no timezone attached) — correct for a subscriber in
the same timezone as the school, which is every real case so far, but not something
to rely on for a subscriber traveling abroad.

### Replanning a lesson

Click "Plan lesson" on an already-planned date the same way — the chat sees the
existing spec/plan and can revise it (different pacing, swap an activity, regenerate
an exercise) rather than starting over. Saving overwrites the previous spec/plan/
materials at that date; nothing is versioned beyond git history, so commit before a
big revision if you want an easy way back.

---

## What the companion knows and generates

**What it remembers between sessions.** Nothing lives only in chat history — every
planned lesson writes a `lesson-spec.json` (constraints: module, phase, focus
competences, pace) and a `manifest.json` (a **coverage ledger** entry: which
competences this lesson touched, at what depth — introduced, practiced, or assessed).
Every future "Plan lesson" session is pre-seeded from that ledger, not from memory of
the conversation, so it's biased toward what's genuinely uncovered or under-depth
rather than repeating or contradicting an earlier lesson.

**Module progression.** The calendar's module bars show real coverage — the percentage
of that module's target competences already met at the required depth — plus, once
`fillModules()` places it, the module's actual **milestone/test date** (shifted forward
off a degraded slot if needed, never earlier than planned) and which competences it
assesses. Clicking a module bar shows the same detail, plus any gaps (uncovered,
under-depth, or at-risk competences) driving the next lesson's focus.

**How it plans a lesson.** A plan is objectives, a short **stage overview** (name,
duration, one-line purpose per stage — scannable in seconds), then a detailed
**timeline**: each stage broken into steps tagged `teacher_intro` (you explaining/
modelling), `pupil_work` (genuinely autonomous — gets a click-to-start countdown timer
pupils can see), or `correction` (reviewing together). Anything a stage narrates —
an input text, new vocabulary, a grammar point — has to exist as an actual material
linked to that stage, not just described in prose; the lesson-plan page renders each
stage's materials inline, right where they're used.

**Exercise types it can build** (self-contained, self-checking, offline/print-ready):
gap-fill, multiple choice, matching, error correction, crossword, flashcards, reorder,
mark-the-words, word search. Plus three non-exercise material types: a **reading
text** (original, controlled-vocabulary input text with a read-aloud button), a
**vocabulary glossary** (pre-taught new words, translation + read-aloud, before
they're needed elsewhere), and a **grammar explanation** (plain-language rule +
before/after examples, flagging German L1 transfer risk where relevant). Homework and
tests are saved separately from the lesson-plan timeline — homework gets an automatic
due date (the class's actual next scheduled lesson, not a fixed "+1 day"), and the
lesson-plan page shows a link to it so it isn't invisible from there.

**Pedagogical skills it invokes** while planning (not just generic prompting — each
encodes a specific method):

| Skill | What it does |
|-------|--------------|
| `lesson-opening` | 8–12 min opening: retrieval starter + prior-knowledge bridge + "I can..." |
| `retrieval-warm-up` | Structured 5–8 min retrieval practice, calibrated to time-since-taught |
| `eal-scaffold` | Scaffolds any exercise for German L1 learners without lowering cognitive demand |
| `difficulty-progression` | Sequences a set from supported → guided → independent |
| `vocab-teaching` | Beck's Tier 1/2/3 selection — which words are worth explicit teaching time |
| `grammar-intro` | Plain-language rule + contrastive German L1 transfer-risk note |
| `error-correction-design` | Realistic German→English transfer errors, one per sentence, find→explain→correct |
| `sentence-frames` | CEFR-graded sentence starters for dialogue/writing/mediation |
| `assessment-design` | Blueprint-before-items test/quiz design, competence × depth matrix |

Every generated item is tagged with the competence IDs it targets, so it feeds
straight back into the coverage ledger once you approve it.

---

## Adapting to another curriculum

The engine is curriculum-agnostic. All curriculum-specific content lives in data files,
not code. To use this for a different state, school type, subject, or country:

### 1. Add a school calendar

Create `calendar/<state>-<year>.yaml`:

```yaml
state: niedersachsen          # or any identifier
school_year: 2026/2027
first_school_day: 2026-08-15
last_school_day: 2027-07-09
holidays:
  - name: Autumn Holidays
    from: 2026-10-19
    to: 2026-10-30
  # ... all holidays for the year
events: []                    # school-specific: project weeks, sports days, etc.
```

Holiday data for German states is available via
[OpenHolidaysAPI](https://openholidaysapi.org)
(`/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-XX`). The fetch helper
`src/calendar/fetchHolidays.ts` can pull it automatically.

### 2. Add a curriculum extraction

Create `curriculum/<id>/meta.yaml`:

```yaml
state: Niedersachsen
school_type: Gymnasium
subject: Französisch
valid_from: "2022-08-01"
source_file: docs/lecture_plans/your-source-lehrplan.md
cefr_targets:
  5-6: A1-A2
```

Place the source curriculum document (markdown) in `docs/lecture_plans/`. Then use the
`curriculum-decompose` skill to extract typed entries into
`curriculum/<id>/grade-bands/<band>.yaml`. The skill handles both the deterministic
table mapping and the AI-assisted semantic decomposition. IDs freeze after your review.

See [docs/extraction-workflow.md](docs/extraction-workflow.md) for the full checklist.

### 3. Create plans and vocabulary

For each grade you teach, create a folder under `plans/`:

```
plans/grade-5/
  class.yaml       # name, grade, track, curriculum reference
  modules.yaml     # module sequence with weekly_lessons, covers, milestones
```

`modules.yaml` defines the teaching sequence — which curriculum competences each module
covers, at what depth, and how many weeks it spans. The `module-derive` skill can draft
this from your curriculum extraction; you review and adjust.

Vocabulary files under `vocabulary/<grade>.yaml` are chain-ordered (each grade excludes
words already taught in prior grades). The `vocab-generate` skill derives these from
the curriculum; every word is screened against a frequency list (NGSL) for level
appropriateness.

### 4. Validate and run

```sh
npm run validate   # checks schema, referential integrity, vocab chain
npm run dev        # start the companion
```

The projection engine, calendar, chat, and all exercise skills work against whatever
data files you provide — no code changes needed.

### What stays, what you replace

| Layer | Curriculum-specific? | What to do |
|-------|---------------------|------------|
| Calendar YAML | Yes (holidays per state/year) | Create one per school year |
| Curriculum extraction | Yes (your Lehrplan) | Run `curriculum-decompose` on your source |
| Module plans | Yes (your teaching sequence) | Draft with `module-derive`, then refine |
| Vocabulary lists | Yes (per grade/subject) | Generate with `vocab-generate` |
| Assessment rules | Yes (state Erlass) | Adapt `assessment/rules.yaml` if using test generation |
| Projection engine | No | Works on any modules.yaml |
| Companion app | No | Works on any data files |
| Exercise skills | Mostly no | Widget types are generic; add subject-specific ones as needed |

---

## For developers

Full system spec lives in `docs/spec/`:

- [00-overview.md](docs/spec/00-overview.md) — problem, design principles, component map
- [01-data-model.md](docs/spec/01-data-model.md) — schemas (curriculum, modules, vocabulary, coverage)
- [02-projection.md](docs/spec/02-projection.md) — calendar projection engine
- [03-generation.md](docs/spec/03-generation.md) — companion app, lesson generator, exercise skills
- [04-roadmap.md](docs/spec/04-roadmap.md) — phasing, decisions log, open questions
- [06-exercise-design-reference.md](docs/spec/06-exercise-design-reference.md) — task formats and design criteria

Other key docs:

- [docs/extraction-workflow.md](docs/extraction-workflow.md) — curriculum extraction checklist, draft-to-diff rule
- [docs/module-derivation-notes.md](docs/module-derivation-notes.md) — grade 5/6 split rationale

### Commands

```sh
npm run dev        # start companion (http://localhost:5199)
npm run validate   # schema + referential + vocab-chain validation
npm test           # vitest unit suite
npm run build      # tsc --noEmit
```

### Current scope

First instance: Sachsen-Anhalt Sekundarschule, English, grades 5–7 (Realschule track).
File layout is additive — extending to other curricula doesn't require reshaping.
