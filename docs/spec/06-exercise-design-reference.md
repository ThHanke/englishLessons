# Exercise & Task Design Reference

Grounds the lesson generator (§4.2), the exercise-type skills (§4.3), and the
`klassenarbeit` skill (§5.6). Distilled from official Saxony-Anhalt materials so the
skills produce tasks that match what the ministry models as "good" and what the exams
actually use.

## Copyright / licensing stance

- The **niveaubestimmende Aufgaben (NbA) Englisch** (LISA) are **copyright-protected**:
  private + non-commercial school use allowed; anything beyond needs LISA written
  permission. The tasks themselves are therefore **never reproduced or committed** to
  this repo.
- What is captured below is **factual, non-copyrightable structure** — task-type
  inventory (titles as an index), skill/format taxonomy, AFB definitions, and the
  published "good task" criteria — usable to steer generation without republishing.
- The generator/skills may read a teacher's **own licensed copy** of the NbA as few-shot
  exemplars at generation time from a **gitignored** local path (`material/nba/`, see
  `.gitignore`). That is the teacher's own non-commercial use; the repo stays clean.
- Sources: NbA Englisch (`docs/rules/rsa-englisch-pruefung-und-afb.md` lists URL),
  RSA exam Hinweise + Fachlehrplan (same file), Leistungsbewertungserlass
  (`docs/rules/leistungsbewertung-lsa-2012-2023.md`).

## "Gute Aufgaben" — design criteria (NbA §1.3, LISA)

Every generated task should aim for these four hallmarks:

1. **Förderung kommunikativer Kompetenzen** — the task both uses and further develops
   sub-competences across listening, reading, speaking, writing, mediation.
2. **Vernetzung von Teilkompetenzen** — solving it links competences, knowledge and
   methods from several areas, incl. earlier grades or other subjects (spiral).
3. **Flexibilität und Anwendungsbereitschaft** — practised in varied, personally
   meaningful contexts so knowledge transfers and lasts.
4. **Differenzierte Förderung** — open tasks allowing multiple solution paths + **gestufte
   Lernhilfen** (tiered scaffolds). This is the pedagogical basis for the first-class
   differentiation the Erlass legally requires (§7.1–7.2).

## Task = Aufgabe + Hinweise convention (NbA)

Each NbA exemplar ships as a pair: **A** (the task/Aufgabe) and **H** (Hinweise = the
Erwartungshorizont + Lösungen/expected answers + Bewertung), tagged by grade band and
AFB. Listening audio lives on the Bildungsserver. Our artifacts mirror this: every
generated exercise/test produces a paired student copy and teacher copy
(Erwartungshorizont + points), matching Erlass §4.1.16.

## Skill areas (5) and exam parts

Listening (Hörverstehen), Reading (Leseverstehen), **Language in Use**, Speaking
(Sprechen), Writing (Schreiben), Mediation (Sprachmittlung). RSA written exam bundles
Reading + Language-in-Use + Mediation + Writing into one part; Listening is separate.

## Task-format inventory (NbA titles + RSA Hinweise)

Closed/semi-closed (auto-checkable → good for interactive widgets):
`multiple_choice`, `multiple_matching`, `table_completion`, `sentence_completion`,
`short_answer`, `note_taking`, `true_false_justification`, `gap_fill`/`cloze`,
`crossword`, `form_filling` (application form / Formular), `dictionary_work`.

Open/productive (rubric-scored):
`creative_writing`, `email/letter` (formal+informal), `diary_entry`, `poster`,
`report`, `description`, `story`, `argumentative_text`, `application_letter`,
`role_cards`/`role_play`, `dialogue`, `mediation` (EN↔DE, both directions),
`picture/cartoon/table/graph_commentary`.

## Exemplar catalog by grade band (index only — titles, not content)

Use as topic/format inspiration; grade 7/8 Realschule is the primary target.

| Band | Skill | Task title |
|------|-------|-----------|
| 5/6 | Listening | Visiting Grandpa |
| 5/6 | Reading | Weekend activities; Penguins |
| 5/6 | Speaking | Penguins; In a shop |
| 5/6 | Writing | The shopping list; Lost Poster; Diary entry |
| 5/6 | Mediation | The poster; Shock your parents |
| **7/8 RS** | Listening | Answering machine |
| **7/8 RS** | Reading | Two formal letters in one |
| **7/8 RS** | Speaking | Welcoming an English speaking guest; Calling the travel agency |
| **7/8 RS** | Writing | Writing an email; Working with the dictionary |
| **7/8 RS** | Mediation | School anniversary; Help a German policeman |
| 9/10 RS | Listening | They called her fat; Eating habits in Britain and Germany; In a restaurant; Mailbox |
| 9/10 RS | Reading | Bicycles |
| 9/10 RS | Speaking | Role Cards |
| 9/10 RS | Writing | Creative writing |
| 9/10 RS | Mediation | Dialogue |
| 7/8 HS | Listening | Some facts about an adventure camp; Answering machine |
| 7/8 HS | Reading | Alaska |
| 7/8 HS | Speaking | Living in Alaska |
| 7/8 HS | Writing | Working with a dictionary; Cross Word |
| 7/8 HS | Mediation | Internet assessment of a hotel |
| 9 HS | Listening | Teenage Life in South Africa |
| 9 HS | Reading | Mutiny on the Bounty |
| 9 HS | Speaking | Welcome guests at a host family |
| 9 HS | Writing | An application form; An adventure story |
| 9 HS | Mediation | Mutiny on the Bounty - Background; Viererteam |

## Format → exercise-skill mapping (extends §4.3 catalog)

| NbA/exam format | our exercise skill (§4.3) | auto-check |
|-----------------|---------------------------|-----------|
| multiple_choice, true_false_justification | `reading_comprehension` / `listening_comprehension` | yes |
| multiple_matching | `matching` | yes |
| sentence_completion, table_completion, cloze | `gap_fill` | yes |
| note_taking, short_answer | `reading_comprehension` (short-answer mode) | partial |
| crossword | new `crossword` skill | yes |
| form_filling | new `form_filling` skill | yes |
| dictionary_work | new `dictionary_work` skill | partial |
| role_cards, dialogue | `dialogue` | rubric |
| creative_writing, email, diary, report, story, argumentative | `writing_prompt` | rubric |
| mediation EN↔DE | `mediation` | rubric |

New skills surfaced here vs. the original §4.3 catalog: `crossword`, `form_filling`,
`dictionary_work`. Add to the skill registry when their phase arrives.

## How the planning skill uses this

- Bias module/lesson planning toward the four "gute Aufgaben" hallmarks (esp. Vernetzung
  + Differenzierung).
- When choosing exercise types for a lesson-spec, prefer formats attested for the target
  skill area + grade band above.
- For tests, mirror the RSA exam structure at reduced scope, tag every item by AFB with
  Schwerpunkt II, and always emit the paired Erwartungshorizont.

## Interactive engine decision (research 05)

Full findings: `docs/spec/research/05-exercise-types-engines.md`. Verified independently:
SortableJS is **MIT, dependency-free, framework-free** (drag-drop). Crossword layout lib
license UNVERIFIED — check before adopting. Haiku "build-hour" estimates are not
authoritative — ignore.

**Decision: custom TypeScript widgets, NOT H5P.**
- We *generate* exercises programmatically from the lesson spec, so H5P's core value
  (WYSIWYG authoring) is irrelevant, while its costs are real: heavy runtime (own
  framework / jQuery in older content types), non-native look, and a mixed/murky
  per-content-type license (MIT vs GPL varies). Skip it — on fit first, license second.
- Build small widgets in TS (Lit or Svelte), compiled + inlined to self-contained single
  HTML files (works `file://`, Pages, print). Add only tiny MIT libs where they save real
  work: **SortableJS (MIT)** for drag-drop; a crossword-layout lib (verify license) or
  hand-roll. Everything else (gap-fill, MCQ, error-correction, flashcards, ordering,
  mark-the-words) is cheap vanilla TS.

**Auto-checkable vs rubric.** Most grade-7 value is in AUTO-CHECKABLE types (gap-fill,
MCQ, matching, reorder, mark-the-words, crossword, error-correction, memory/flashcards)
— these get instant self-check in the widget. Speaking/writing/mediation stay
rubric/teacher-scored (no fake auto-grading of free text — matches out-of-scope §5.4).

**First-build set (grade 7), highest value + cheap + auto-checkable:**
1. `gap_fill` (cloze) — custom TS — grammar (tenses/conditionals), vocab-in-context.
2. `mcq` / question-set — custom TS — the leverage type: substrate for reading,
   listening (via Web Speech §4.4), and vocab in one engine.
3. `matching` (drag-drop) — SortableJS (MIT) — vocab, collocations, prepositions.
4. `error_correction` — custom TS — grammar consolidation (agreement, tense).
5. `crossword` — verified-MIT lib or hand-roll — vocab retention + spelling.
Later: flashcards, mark-the-words, reorder, word-search.
