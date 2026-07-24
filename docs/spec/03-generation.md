# Generation Pipeline (Components E, G, H) and Web Tool (F)

## 4.1 Planning web tool (F)

Purpose: let the teacher browse the projected year, pick a date, export a lesson spec,
and reach generated artifacts. Explicitly *not* an authoring IDE — editing plans is
done in the YAML files (optionally through the tool later).

**Three view modes** (toggle, same data): **Week**, **Month**, and **full school-year
overview**. All three:
- mark **today** distinctly;
- show **modules** as colored bands so the current module is obvious at a glance;
- mark **holidays/Ferien** and school **events** (Projektwoche, Sportfest…);
- mark **test / milestone dates**;
- shade pace-degraded slots; badge dates that have generated artifacts.

**Detail on hover or click.** Hovering a day/week shows a tooltip (module, phase, pace
reason, next-milestone countdown). Clicking a day opens a detail window showing that
day's full **lesson spec** (Component E) — readable, plus the raw `lesson-spec.json` with
a **Copy** button — and links: "Open artifacts" (if present). Because the exporter (E) is
purely deterministic (projection + curriculum + coverage, no AI), **every day's spec is
pre-computed at build time and embedded** in the static site; viewing and copying it needs
no model call. The copied spec is exactly what the teacher hands to the generator (O/G),
or the orchestrator (§4.6) recomputes it itself — same deterministic contract either way.

**Grade dropdown (use-case switcher).** Choose **grade 5 / 6 / 7** (the in-scope classes;
generic over `plans/*`). Switching re-renders the views for that grade's plan + calendar.
Adding a class = adding a plan file, no code change.

Tech direction (settled, §4.7): **static, no backend, no SPA.** All plan/calendar/artifact
data is pre-rendered to embedded JSON at build time; the three view modes, the grade
dropdown, and the hover/click tooltips run on **small inline vanilla JS** over that
embedded data — client-side view toggling and tooltips are not a backend and not an SPA
framework. Served by GitHub Pages. Read/browse only; authoring happens via the
conversational orchestrator (§4.6) and the YAML files.

**Companion skill (`lesson-spec` skill).** A Claude Code skill accompanies the tool so
the teacher can, from the terminal or the tool's "generate" action, run:
`export the lesson spec for 7a on 2026-01-14` → the skill invokes the deterministic
exporter, validates against the curriculum, and writes `lesson-spec.json`. Keeping this
as a skill (not buried in the web app) makes it scriptable and lets the generator chain
off it.

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

   **Textbook reference slot (citation only, teacher-supplied).** The tool never stores
   or generates book content. Instead, after drafting the plan the orchestrator (§4.6)
   *asks the teacher in conversation* which textbook references to slot in, and the
   teacher answers with a plain citation ("S. 45, Aufgabe 1.4"). That citation is
   embedded into the lesson plan as a teacher-directed step ("do S.45/1.4 from your
   book here"). A reference string is not copyrighted content, so it is safe to publish
   (§4.7). Each material slot therefore offers two paths: a generated interactive widget,
   or a teacher-supplied textbook citation the teacher works from their own copy.
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

The **primary interface is conversational**, not the web app. The teacher asks the
agent to prepare a lesson; the static site is the published *output*, browsed after the
fact. See §4.6 for the orchestrator and §4.7 for hosting.

```
teacher: "prepare tomorrow's lesson for 7a"
  -> prepare-lesson orchestrator (§4.6)
     -> projection engine (D): which module, week-in-module, pace factor
     -> pull prior generated lessons in the same module (continuity)
     -> draft plan  --> SHORT SUMMARY to teacher --> confirm/adjust
     -> ASK teacher for textbook references to slot in (citations only)
     -> lesson-spec (E) -> lesson generator (G) plans + emits exercise requests
        -> exercise-type skills (H) each build one widget
        -> optional homework via skills
     -> write artifacts + update calendar index (I)
     -> teacher REVIEWS worksheets + answer keys (required)
  -> teacher: git push -> GitHub Pages -> static URLs live
```

## 4.6 The `prepare-lesson` orchestrator (primary interface)

One skill that runs the conversation the teacher actually has. Steps:

1. **Locate.** Resolve the target date via the projection engine (§02): active module/
   module, week-in-module, phase, pace factor and reason.
2. **Recall (load-bearing).** Load the `gapReport` (§02) and prior generated lessons in
   the *same module* plus the accumulated `known_vocab`. The new lesson is biased toward
   **uncovered / under-depth / at-risk** competences (§3.7) so it continues the sequence
   and closes gaps instead of repeating or contradicting earlier lessons. This coverage-
   driven continuity is the whole point (§00 §2).
3. **Draft + confirm.** Produce a short human-readable plan summary (objectives, stages,
   which exercises, milestone proximity) and present it. Teacher confirms or adjusts
   before anything is generated.
4. **Textbook references.** Ask the teacher which textbook citations to include
   (e.g. "S. 45, Aufgabe 1.4"). Embed as teacher-directed steps. Citations only — never
   book content (§4.2).
5. **Generate.** Run lesson-spec export (E) → lesson generator (G) → exercise skills (H)
   → optional homework.
6. **Review the artifacts (required, distinct from step 3).** The teacher opens the
   generated worksheets, tests, and **answer keys** — not just the earlier outline — and
   approves or requests regeneration. Nothing publishes on the strength of an approved
   outline alone; an incorrect answer key or ungrammatical item must be caught here before
   it reaches pupils or a public URL.
7. **Publish.** Write the dated artifacts and update the calendar index (§4.7). Teacher
   pushes; GitHub Pages serves.

## 4.7 Delivery: static site on GitHub Pages

No backend, no database, no SPA. The agent writes files; `git push` publishes them via
GitHub Pages at stable per-date URLs.

- **Artifacts** (lesson pages, worksheets, tests, homework): self-contained static HTML,
  inline JS/CSS, framework-free (§4.4). Work on Pages, `file://`, and printed.
- **Site chrome** (calendar index, lesson pages): static-generated HTML from the
  projection output — a hand-rolled CSS week grid colored by module, plain `<a>` links
  to dated pages. No interactive calendar library (avoid FullCalendar — GPL/commercial).
  Optional generator: Eleventy (MIT) if hand-templating gets tedious.
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
