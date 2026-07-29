# english_leasons

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
   cd englishLeasons
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

### 1. Set up your lesson schedule

The calendar shows all your grades as overlay layers. To define when you teach each
grade:

- **Drag** in day or week view, or click the **+** button
- Pick the grade and half-year (auto-detected from the school calendar)
- Appointments are created for every school day in that half-year, automatically
  skipping holidays, weekends, and blocked days

Schedules are saved to the calendar YAML file in the repo. To change a schedule,
delete the series and recreate it.

### 2. Plan a lesson

- **Click an appointment** on the calendar — a context panel shows which curriculum
  module is active for that date, where you are in the module, and what coverage gaps
  remain
- **Click "Plan lesson"** — a chat session opens, pre-loaded with all the context for
  that date
- The chat can:
  - Draft a lesson plan and ask you to confirm or adjust
  - Ask which textbook pages to reference (citations only, no book content stored)
  - Write a **lesson spec** that tracks which competences the lesson covers
  - Generate **exercise materials** (interactive HTML widgets)
- Review the generated worksheets and answer keys before accepting

### 3. Publish

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

### Module progress

Each lesson spec you accept feeds the **build ledger** — it tracks which curriculum
competences have been introduced, practiced, or assessed across the school year. The
coverage gaps shown when you click an appointment come from this ledger, so each new
lesson is guided toward what still needs teaching.

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
