# Generation Pipeline (Components E, G, H) and Web Tool (F)

## 4.1 Teacher companion (F) — calendar + chat

Purpose: let the teacher browse the projected year, manage lesson scheduling, and plan
lessons through an embedded chat — all in one local app.

**Architecture.** A single local Node process (Vite in middleware mode + Express) serves
a React frontend and API on one origin (`127.0.0.1` only). The calendar uses
`@svar-ui/react-calendar` for interactive day/week/month views. Auth uses a local file
token, no external service.

**Calendar.** All in-scope grades (5, 6, 7) display simultaneously as toggleable
overlay layers on one calendar. Modules appear as colored task bars spanning their
projected date ranges. Holidays and non-school events are marked.

**Lesson series creation.** The teacher defines their schedule by drag-creating in
day/week view or via a "+" button. This opens a form to create a recurring lesson series
for a grade in a selected half-year. Appointments are generated for every valid school
day, skipping holidays, weekends, and `capacity: 0` events. Series persist as
`lesson_slots` in the calendar YAML. The half-year boundary is derived from Winter
Holidays with an explicit override field. Deleting a series removes all its slots.

**Appointment click → context → chat.** Clicking an appointment shows the curriculum
module context for that date (active module, week-in-module, phase, coverage gaps).
Clicking "Plan lesson" opens a chat session seeded with that context. The chat runs as
a Claude Agent SDK session with access to pedagogical skills (`save_lesson_spec`,
`save_material`, and the repo's existing curriculum/vocab skills). Each date's
conversation persists across sessions.

**Generated artifacts** (lesson specs, materials) are written to the repo. The lesson
spec feeds the build ledger to track module progress. After `git push`, artifacts are
served statically via GitHub Pages at stable per-date URLs.

**Projection and scheduling.** Once a class has real `lesson_slots` (set via the
calendar's drag-create), projection places modules against that actual schedule, not a
guess — see 02-projection.md §1. `weekly_lessons` from `modules.yaml` still drives
budget math (`module.weeks * weekly_lessons`) and phase bucketing, but the *dates*
always come from the real schedule once one exists, so the chat's teaching-day
classification and the calendar's appointments can never disagree. Before a schedule
exists, projection falls back to a coarse week-count preview for the calendar's module
bars only — never for the chat's per-date context.

## 4.2 Lesson generator (G)

Input: one `lesson-spec.json`. Output: a `lesson-plan.html` (teacher-facing) and a set
of student materials. This is an AI skill/agent because it turns constraints into
concrete pedagogy.

Pipeline:
1. **Plan the lesson.** From the spec's `focus_competences`, `phase`, `pace_factor`,
   `content_field`, `text_types`, and `known_vocab_ref`, produce a structured lesson
   plan: objectives, timed stages (warm-up/review → input → guided practice →
   production → wrap-up), differentiation notes, and the list of exercises to build with
   their parameters. Degraded `pace_factor` shortens the new-input stage and expands
   review. All generated language stays within the controlled vocabulary (§3.6);
   genuinely new target words go into a pre-taught glossary, not silently into tasks.

   **Each stage is structured, not a prose paragraph.** A stage has `name`,
   `durationMinutes`, `purpose` (one sentence — why this stage exists), `procedure`
   (ordered steps, one per array entry), and `materialRefs` (the manifest
   filenames of any material this stage actually uses or introduces). This is what
   renders as a readable, textbook-shaped stage card instead of a wall of text — see
   `renderStageCard`/`renderLessonPlanTimeline` in `src/publish/`. The lesson page also
   renders a short "Stage overview" (name, duration, one-line purpose per stage) before
   the detailed "Timeline" — a table of contents a teacher can scan in seconds before
   reading the full stage-by-stage detail.

   **Each procedure step names who's driving it.** A step is `{ kind, text,
   durationMinutes? }`, `kind` one of `teacher_intro` (teacher explains/models),
   `pupil_work` (pupils work alone/in pairs — genuinely autonomous, not teacher talk),
   or `correction` (reviewing answers together). A `pupil_work` step with
   `durationMinutes` renders a Start-timer button pupils can click and count down
   (`STAGE_TIMER_JS`, plain client-side `setInterval` — visual-only at zero, no sound,
   since autoplay-audio reliability varies across devices in a classroom). Step
   durations for a stage should roughly sum to that stage's own `durationMinutes`.

   **No unexplained abbreviations or jargon** in `purpose`/`procedure` (e.g. "SVO", "L1")
   — a teacher skims these, don't make them decode shorthand mid-lesson. Spell it out in
   full on first use, or don't use it at all.

   **Nothing is narrated without existing as a material.** If a stage reads or plays an
   input text (e.g. "students read a short text about..."), that text must be saved via
   `save_reading_text` first and referenced in `materialRefs` — an original, AI-authored
   passage is generated content like any exercise, distinct from the textbook-citation
   path below. If a stage introduces new target vocabulary or phrases, `find_new_vocabulary`
   → `generate_vocab_intro` must be called and the result referenced in `materialRefs` —
   writing new words "on the board" in the stage's `procedure` is not a substitute for the
   pre-taught glossary. If a stage introduces or recaps a grammar point (invoke the
   `grammar-intro` skill first — almost every lesson has one), it must be saved via
   `save_grammar_intro` (rule explanation + before/after examples) and referenced in
   `materialRefs` — a rule mentioned only as a "mini board note" inside `procedure` never
   reaches the pupil-facing page. The lesson-plan page renders each stage's referenced
   materials inline, directly under that stage, instead of a disconnected Materials list
   at the bottom — a stage that narrates a text/vocab/grammar point that was never saved
   and referenced simply won't show it to the teacher.

   **Textbook reference slot (citation only, teacher-supplied).** The tool never stores
   or generates *textbook* content. Instead, after drafting the plan the orchestrator
   (§4.6) *asks the teacher in conversation* which textbook references to slot in, and
   the teacher answers with a plain citation ("S. 45, Aufgabe 1.4"). That citation is
   embedded into the lesson plan as a teacher-directed step ("do S.45/1.4 from your
   book here"). A reference string is not copyrighted content, so it is safe to publish
   (§4.7). Each material slot therefore offers three paths: a generated interactive
   widget, an original generated input text (`save_reading_text`), or a teacher-supplied
   textbook citation the teacher works from their own copy.
2. **Emit exercise requests.** For each planned exercise, produce a typed request
   `{ type, competence_ids, difficulty, content, items... }` and dispatch to the
   matching exercise-type skill (H).
3. **Bundle.** Collect widget HTML into `materials/`, generate `index.html` that frames
   them, and write `manifest.json` linking everything back to the date for the web tool.
   The manifest includes the **`covered` record** (§3.7a) — which competences this lesson
   advanced, to what depth, via which exercise types — so the coverage ledger and gap
   report stay current with no manual bookkeeping.

The lesson plan is itself an HTML artifact so it renders in the same registry and links
from the calendar.

## 4.3 Exercise-type skills (H)

One skill per exercise type. Each takes a typed request and returns a self-contained,
offline HTML widget (inline JS/CSS, no external CDN, license-clean). Self-contained =
one file the teacher can open or print. Each widget provides: instructions, the
interactive task, self-check/answer reveal, and a completion signal.

Initial catalog (driven by the grades 5–7 curriculum):

| Skill | Type id | Curriculum hook | Interaction |
|-------|---------|-----------------|-------------|
| gap-fill | `gap_fill` | grammar/vocab (present perfect, conditionals) | fill blanks, validate |
| multiple choice / quiz | `mcq` | reading, listening, vocab, grammar (leverage type) | select answer(s), self-check |
| error correction | `error_correction` | grammar consolidation (agreement, tense) | find + fix the error, check |
| tense/form id | `tense_id` | grammar (identify tense/voice/clause type) | classify highlighted forms |
| grammar transform | `transform` | active↔passive, direct↔indirect, clause building | rewrite sentence, check |
| matching | `matching` | vocabulary, connectors, collocations | drag/click pairs |
| reordering | `reorder` | sentence/paragraph structure, storyboard | order fragments |
| reading comprehension | `reading_comprehension` | Leseverstehen | text + MCQ/short answer |
| listening comprehension | `listening_comprehension` | Hörverstehen | **Web Speech API** (`speechSynthesis`) reads the text at runtime + tasks; ships transcript fallback |
| dialogue/roleplay builder | `dialogue` | Sprechen, text type dialog | prompts + sentence starters |
| writing prompt | `writing_prompt` | Schreiben, productive text types | scaffolded prompt + checklist |
| mediation task | `mediation` | Sprachmittlung | DE↔EN gist transfer task |
| crossword | `crossword` | vocabulary consolidation | fill grid from clues |
| form filling | `form_filling` | text type Formular / application form | complete fields, validate |
| dictionary work | `dictionary_work` | Textrezeption, decoding unknown lexis | guided lookup task |

The last three come from the Saxony-Anhalt task catalog — see
`06-exercise-design-reference.md`, which also maps every official NbA/exam format to a
skill above and records the "gute Aufgaben" design criteria the widgets should meet.
Each skill declares which `competence_ids` / grammar topics it can target so the
generator can pick appropriate ones for a spec. Adding a new exercise type = adding a
new skill file; the generator discovers it from a registry manifest.

## 4.4 Shared conventions for widgets

- Single self-contained HTML file, works `file://`, GitHub Pages, and printed. No
  *runtime* framework dependency and no CDN — but a widget may be *authored* in a compiled
  component framework (Lit/Svelte, §06) that bundles + inlines to one file. "Framework-free"
  refers to the output, not the authoring toolchain.
- Consistent lightweight design system (one shared CSS snippet copied in) for a
  coherent look across materials — see `dataviz`-style discipline if charts appear.
- Answer key toggled (teacher copy vs. student copy) via a build flag in the request.
- Accessibility: keyboard-usable, sufficient contrast, works without JS for print.
- German UI chrome, English content (aufgeklärte Einsprachigkeit: instructions may be
  German where the curriculum allows).
- **Listening audio via the browser's Web Speech API** (`speechSynthesis`), synthesized
  at runtime — no bundled audio files, keeps the single-file/offline property. Set
  `lang` (en-GB/US), prefer a matching installed voice, expose play/pause/replay + speed.
  Voices vary by device and offline availability isn't guaranteed → always ship the
  transcript and degrade gracefully (print shows transcript). Optional future upgrade:
  pre-rendered Piper TTS audio when a fixed voice is required (breaks single-file; defer).

## 4.5 End-to-end flow

The **primary interface is the companion app** — calendar + embedded chat. The teacher
manages their schedule in the calendar and plans lessons through the chat. Generated
artifacts are committed and served statically after `git push`.

```
1. Teacher opens companion app (localhost)
2. Calendar shows all grades with module task bars, holidays, lesson appointments
3. Teacher creates lesson series (drag or + button) → recurring appointments for a
   half-year, skipping non-school days → persisted as lesson_slots in calendar YAML
4. Teacher clicks an appointment → context panel shows:
   - active module, week-in-module, phase, pace factor
   - coverage gaps for the active module (gapReport)
   - existing lesson-spec/artifacts for that date (if any)
5. Teacher clicks "Plan lesson" → chat session starts, seeded with date context
6. Chat (Claude Agent SDK) uses pedagogical skills:
   - draft plan → confirm/adjust with teacher
   - ask for textbook references (citations only)
   - save_lesson_spec → writes spec, feeds build ledger for module progress
   - save_material → exercise skills (H) each build one widget
   - teacher REVIEWS worksheets + answer keys (required)
7. Teacher: git push → GitHub Pages → static URLs live
```

## 4.6 The `prepare-lesson` orchestrator (companion chat)

The conversation the teacher has through the companion's embedded chat. The chat session
is seeded with date context from the calendar click (§4.1) and backed by the Claude
Agent SDK with access to pedagogical skills. Steps:

1. **Context (pre-seeded).** The companion pre-builds context when the teacher clicks an
   appointment: active module, week-in-module, phase, pace factor (from projection
   engine §02), coverage gaps (`gapReport`), and prior generated lessons in the same
   module plus accumulated `known_vocab`.
2. **Recall (load-bearing).** The chat session is biased toward **uncovered / under-depth
   / at-risk** competences (§3.7) so it continues the sequence and closes gaps instead of
   repeating or contradicting earlier lessons. This coverage-driven continuity is the
   whole point (§00 §2).
3. **Draft + confirm.** Produce a short human-readable plan summary (objectives, stages,
   which exercises, milestone proximity) and present it. Teacher confirms or adjusts
   before anything is generated.
4. **Textbook references.** Ask the teacher which textbook citations to include
   (e.g. "S. 45, Aufgabe 1.4"). Embed as teacher-directed steps. Citations only — never
   book content (§4.2).
5. **Generate.** Use `save_lesson_spec` to write the spec (feeds the build ledger for
   module progress tracking) → `save_material` for exercise widgets (H) → optional
   homework. The homework page's due date is not authored by the LLM — it's computed at
   render time as the class's next scheduled lesson date after this one (from the
   calendar's `lesson_slots`, `findNextLessonDate` in `src/projection/`), since a class
   meets on multiple weekdays and "next lesson" isn't a fixed offset.
6. **Review the artifacts (required, distinct from step 3).** The teacher opens the
   generated worksheets, tests, and **answer keys** — not just the earlier outline — and
   approves or requests regeneration. Nothing publishes on the strength of an approved
   outline alone; an incorrect answer key or ungrammatical item must be caught here before
   it reaches pupils or a public URL.
7. **Publish.** Artifacts are already written to the repo. Teacher pushes; GitHub Pages
   serves.

## 4.7 Delivery: companion (local) + static site (published)

Two layers:

**Local companion** (`src/companion/`): Express + Vite (middleware mode) + React on
`127.0.0.1`. The teacher's authoring environment — calendar, lesson series management,
chat-based lesson planning. Runs locally; never exposed to the internet. Auth via a
local file token.

**Published output** (GitHub Pages): generated artifacts are committed to the repo;
`git push` publishes them at stable per-date URLs. No backend needed for the published
site — it is pure static HTML.

- **Artifacts** (lesson pages, worksheets, tests, homework): self-contained static HTML,
  inline JS/CSS, framework-free (§4.4). Work on Pages, `file://`, and printed.
- **URL scheme** (stable, permanent once pushed):
  ```
  /                                             year calendar index
  /classes/7a/                                  class calendar
  /classes/7a/2026-01-14/                        lesson page (plan + links)
  /classes/7a/2026-01-14/materials/01-....html   a worksheet
  /classes/7a/2026-01-14/homework/               optional
  ```
- **Publishing is safe** because artifacts contain no student data and textbook
  references are citations, not content. (If a teacher ever pastes actual book text into
  a file, that must stay in gitignored `material/` and not be pushed — but the standard
  flow never does this.)
