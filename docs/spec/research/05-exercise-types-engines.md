# Research: Interactive Exercise Types & Engines for EFL/ESL

Date: 2026-07-23  
Audience: Grade 7 English (German Sekundarschule, CEFR A2–B1, English as first foreign language)  
Scope: Auto-checkable interactive exercises for offline self-contained HTML widgets

---

## PART A: Standard EFL/ESL Interactive Exercise Types

This section surveys established practice in digital language learning, covering 18 exercise types used in EFL/ESL classrooms.

### Exercise Type Catalogue

| Type | Learner Action | Skill Areas | Grammar/Vocab Focus | Auto-Checkable | Grade-7 Value |
|------|---|---|---|---|---|
| **Gap-fill / Cloze** | Fill missing word(s) in text | Reading, Writing | Tenses, vocab in context, phrase vocab | ✓ Yes | ★★★★★ |
| **Multiple Choice (single)** | Select one correct answer | All (listening, reading, grammar, vocab) | Grammar concepts, phrasal verbs, discourse markers | ✓ Yes | ★★★★★ |
| **Multiple Choice (multi-select)** | Select all correct answers | All | Vocab synonyms, grammar applications | ✓ Yes | ★★★★ |
| **Drag-and-drop matching** | Drag item to matching drop zone | Reading, Vocabulary, Grammar | Vocab matching, prepositions, collocations | ✓ Yes | ★★★★★ |
| **Drag-to-order / Sequencing** | Reorder words/sentences/ideas | Writing, Grammar, Reading | Word order, sentence structure, discourse coherence | ✓ Yes | ★★★★ |
| **Dropdown-in-text** | Select from dropdown in context | Grammar, Vocabulary | Articles, prepositions, tenses | ✓ Yes | ★★★★ |
| **Mark-the-words / Highlight** | Highlight/select specific words | Reading, Vocabulary, Grammar | Identifying verb forms, connectors, stress placement | ✓ Yes | ★★★ |
| **Crossword** | Fill grid with vocabulary words | Vocabulary, Spelling | Noun/verb/adj forms, topic vocab, definitions | ✓ Yes | ★★★★ |
| **Word search** | Find words hidden in grid | Vocabulary, Scanning | Topic vocabulary, vocabulary recognition | ✓ Yes (checking only) | ★★★ |
| **Memory / Pairs game** | Match pairs (word-image, word-definition) | Vocabulary | Vocabulary recall, synonyms, word families | ✓ Yes | ★★★ |
| **Image hotspots** | Click regions on image for labels/definitions | Vocabulary, Listening | Vocabulary labeling, pronunciation, definitions | ✓ Yes | ★★★ |
| **Flashcards / Spaced repetition** | Review cards front/back, self-rate | Vocabulary, Listening | Vocabulary retention, pronunciation, word families | ✓ Yes (review tracking) | ★★★★ |
| **Error identification / Correction** | Find & fix grammar errors in text | Grammar, Writing | Tenses, agreement, word choice, spelling | ✓ Yes | ★★★★ |
| **Sortable categories** | Drag items into labeled groups | Vocabulary, Grammar | Word families, parts of speech, semantic fields | ✓ Yes | ★★★ |
| **Sentence transformation** | Rewrite sentence maintaining meaning | Grammar, Writing | Passive/active, tense shifts, nominalization | ~ Partial | ★★★★ |
| **Dictation (text)** | Listen & type spoken words/sentences | Listening, Writing, Spelling | Phoneme discrimination, connected speech, spelling | ~ Manual | ★★★★ |
| **Dialogue / Branching scenarios** | Choose dialogue paths, role-play | Speaking, Listening, Mediation | Functional exponents, pragmatics, context awareness | ~ Manual | ★★★★ |
| **Question Set (Quiz)** | Answer sequence of mixed question types | All | All grammar/vocab types above in one flow | ✓ Yes | ★★★★★ |

**Notes:**
- ★★★★★ = Highest pedagogical value for Grade 7 A2–B1
- "Auto-checkable": Deterministic correct answer(s) computable by form values
- "~ Manual": Needs teacher/rubric review or learner self-assessment
- "~ Partial": Structured answer checking, but some modes require feedback review

### Skill-Area Mapping

**Listening:** Dictation, Image hotspots (pronunciation audio), Flashcards (audio front), Branching dialogue, Question Set with audio playback  
**Reading:** Gap-fill, Multiple choice, Mark-the-words, Sequencing, Error ID, Crossword, Word search, Image hotspots (text labels)  
**Writing:** Gap-fill (spelling), Error correction, Dictation (transcription), Sentence transformation, Short-answer (in Question Set)  
**Speaking:** Branching dialogue, Dictation (speech-to-text), recorded Question Set responses  
**Mediation (EN↔DE):** Sentence transformation (translate), Multiple choice (comprehension of DE into EN), Gap-fill (lexical mediation)  
**Grammar focus:** Drag-and-drop, Dropdown-in-text, Mark-the-words, Error ID, Sentence transformation, Sequencing  
**Vocabulary focus:** Gap-fill, Multiple choice, Drag-and-drop matching, Flashcards, Memory, Image hotspots, Word search, Crossword, Sortable categories

---

## PART B: Auto-Checkable Tools & Build Approaches

This section enumerates open/permissive (MIT/Apache/BSD/CC-BY) tools and libraries for building auto-checkable exercises as self-contained offline HTML in TS/web stack.

### H5P: Content Types & Licensing

**Source:** [H5P Licensing](https://h5p.org/licensing), [H5P Examples](https://h5p.open.ubc.ca/h5p-examples/), [UBC H5P Content Types](https://elearning.uq.edu.au/staff-guides-ultra/h5p-interactive-learning-objects-ultra/h5p-content-types-ultra)

#### Relevant H5P Content Types for EFL/ESL (Auto-Checkable)

| Content Type | Exercise Type | Auto-Check | Notes |
|---|---|---|---|
| **Fill in the Blanks** | Gap-fill / Cloze | ✓ Yes | Case-sensitive, includes/excludes options configurable |
| **Drag and Drop** | Drag-and-drop matching | ✓ Yes | Drag items (text/image) to named zones |
| **Drag the Words** | Drag-to-order in sentences | ✓ Yes | Words dragged into blanks; order matters |
| **Mark the Words** | Highlight specific words | ✓ Yes | Learner selects words matching criteria (verb forms, etc.) |
| **Multiple Choice** | Single/multi-select quiz | ✓ Yes | Flexible points per option |
| **True/False Question** | Boolean choice | ✓ Yes | Simplest question type |
| **Image Choice** | Select image matching prompt | ✓ Yes | Image selection from grid |
| **Image Sequencing** | Reorder images | ✓ Yes | Drag images into correct order |
| **Find the Hotspot** | Click single region on image | ✓ Yes | Single correct hotspot on image |
| **Find Multiple Hotspots** | Click multiple regions on image | ✓ Yes | Learner finds all labeled hotspots |
| **Crossword** | Fill vocabulary grid | ✓ Yes | Auto-fills clues, hints per clue |
| **Memory Game** | Match pairs (images or text) | ✓ Yes | Classic memory card flip game |
| **Flashcards** | Vocabulary review | ✓ Yes (for attempts) | Front/back card flips, learner self-rates |
| **Dictation** | Listen & type text | ✓ Yes (exact match) | Built-in audio recording/playback |
| **Audio Recorder** | Learner records speech | ~ Manual | Plays back, no auto-check (teacher review) |
| **Essay** | Free-text response | ~ Manual | Submission tracking, teacher grading only |
| **Question Set (Quiz)** | Multiple question sequence | ✓ Yes (for supported types) | Combines Fill, Drag, Multiple choice, True/False, Image types |

#### H5P Licensing & Deployment

**Core H5P Framework:**
- **License:** MIT License (primary goal)
- **Exception:** Third-party input sanitization code (H5P PHP Library) requires GPL compliance; this can be made optional in future versions
- **Practical:** For self-hosted offline use (Moodle, WordPress), the GPL code is bundled but optional

**Content:**
- **License:** Creative Commons Attribution 4.0 (CC-BY-4.0)
- **Meaning:** Creators retain ownership; reuse requires attribution
- **Self-hosted:** Can embed H5P .h5p files; no licensing restrictions on outputs

**Deployment for Offline/Self-Contained HTML:**
- **H5P Standalone:** Use [tunapanda/h5p-standalone](https://github.com/tunapanda/h5p-standalone) to render .h5p files without a server
  - Single `.html` file can embed H5P content
  - Offline-capable, works from `file://` URLs
  - Requires bundling H5P libraries (~5–8 MB uncompressed)
- **Export:** H5P.org allows download of content as `.h5p` packages for offline use
- **Lumi Education:** Free desktop app for creating & editing H5P content offline

**Verdict:** ✅ **Go.** H5P MIT core + optional GPL sanitization is acceptable. Offline self-contained export is verified.

---

### Lightweight Alternatives: MIT/Apache/BSD Libraries

#### Gap-Fill / Cloze
- **Build-from-scratch:** ✅ **Trivial.** Form with text input validation against regex or exact match; ~50 lines TS.
- **Library:** No specialized library needed. Native `<input>` or `<textarea>` suffices.

#### Drag-and-Drop / Sortable

| Library | License | URL | Offline | Build Cost | Notes |
|---------|---------|-----|---------|-----------|-------|
| **SortableJS** | MIT | [github.com/SortableJS/Sortable](https://github.com/SortableJS/Sortable) | ✓ Yes | Low | Reorderable lists, multi-drag support, touch-friendly, ~25 KB min |
| **interact.js** | MIT | [interactjs.io](https://interactjs.io/) | ✓ Yes | Low–Med | Drag/resize/touch gestures, inertia snapping, ~60 KB min |
| **Native HTML5 DnD** | — | MDN | ✓ Yes | Low | Browser API, no library; fragile in practice, mobile issues |

**Recommendation:** SortableJS for reordering; interact.js for complex gesture interactions. Both permissive, offline-safe, TypeScript-ready.

#### Flashcards / Spaced Repetition

| Library/App | License | URL | Offline | Build Cost | Notes |
|---------|---------|-----|---------|-----------|-------|
| **ts-fsrs** | AGPL | [github.com/open-spaced-repetition](https://github.com/open-spaced-repetition) | ✓ Yes | Med | FSRS 5 algorithm in TS; AGPLv3 (copyleft—may not fit your MIT stack) |
| **Flashcards Open Source App** | MIT | [github.com/kirill-markin/flashcards-open-source-app](https://github.com/kirill-markin/flashcards-open-source-app) | ✓ Yes | High | Full app with React, spaced repetition, AI; overkill for widgets |
| **Build-from-scratch** | — | — | ✓ Yes | Low–Med | Simple card flip (HTML/CSS/TS) + localStorage for recall tracking; no algorithm needed for basic practice |

**Recommendation:** Build from scratch (simple flip + localStorage) for MVP. FSRS licensing is problematic (AGPLv3 copyleft). Consider ts-fsrs only if you plan full open-source release.

#### Crossword

| Library | License | URL | Offline | Build Cost | Notes |
|---------|---------|-----|---------|-----------|-------|
| **Crossword Layout Generator** | MIT OR Apache-2.0 | [github.com/MichaelWehar/Crossword-Layout-Generator](https://github.com/MichaelWehar/Crossword-Layout-Generator) | ✓ Yes | Med | Takes word list + definitions; outputs SVG grid; solver included |
| **crossword-generator (npm)** | — | Various on npm | ✓ Yes (most) | Low–Med | Multiple lightweight generators; check individual licenses |
| **Build-from-scratch** | — | — | ✓ Yes | High | Layout algorithm (backtracking), rendering, solver; not trivial |

**Recommendation:** Crossword Layout Generator (MIT/Apache, proven). Alternatively, hand-craft grids for grade-7 topics (simpler, reliable).

#### Word Search

| Library | License | URL | Offline | Build Cost | Notes |
|---------|---------|-----|---------|-----------|-------|
| **Wordfind.js** | MIT | [github.com/bunkat/wordfind](https://github.com/bunkat/wordfind) | ✓ Yes | Low | Generates grid + solver; browser/Node; ~10 KB |
| **word-search-generator (Angular)** | MIT | [github.com/pablo-medina-dev/word-search-generator](https://github.com/pablo-medina-dev/word-search-generator) | ✓ Yes | Med | Full Angular 8 app; can extract core generator |
| **Build-from-scratch** | — | — | ✓ Yes | Med | Grid layout simpler than crossword; ~100 lines TS for generator |

**Recommendation:** Wordfind.js for quick integration. Or build from scratch—word search grid layout is simpler than crossword.

#### Dictation (Speech Recognition)

| Library | License | URL | Offline | Build Cost | Notes |
|---------|---------|-----|---------|-----------|-------|
| **Annyang** | MIT | [github.com/TalAter/annyang](https://github.com/TalAter/annyang) | ✓ Yes | Low | Speech Recognition API wrapper, ~2 KB; browser-based, no server |
| **Pocketsphinx.js** | MIT + BSD | [syl22-00.github.io/pocketsphinx.js](https://syl22-00.github.io/pocketsphinx.js/) | ✓ Yes | Low–Med | Full offline speech recognizer (WASM); ~500 KB; higher accuracy than cloud; no internet needed |
| **Web Speech API** | — | MDN | ✓ Yes | Low | Browser standard; Annyang is a thin wrapper; mobile support varies |

**Recommendation:** Annyang (MIT, minimal) for MVP using browser's cloud Speech Recognition API (requires internet). Pocketsphinx.js (MIT, offline-capable, larger) if offline speech-to-text is critical.

#### Error Correction / Identification

- **Build-from-scratch:** ✅ **Low.** Comparison logic (word-by-word, regex matching) in ~100 lines TS.
- **Pattern:** Provide sentences with errors marked; learner identifies/fixes. Validate against regex or exact string.
- **Library:** None specialized. Use form validation + string comparison.

#### Multiple-Choice / Quizzes

- **Build-from-scratch:** ✅ **Trivial.** Radio buttons or checkboxes + array of correct answers; ~30 lines TS.
- **Library:** Use H5P Question Set for bundling multiple types into one quiz; or vanilla forms for simplicity.

#### Image Hotspots

- **Build-from-scratch:** ✅ **Low.** HTML `<map>` + `<area>` + JavaScript click handlers; ~50 lines TS for feedback.
- **Library:** Native HTML5 image maps; no library needed. SVG `<circle>` or `<rect>` elements alternative for complex shapes.

#### Crossword, Memory, Sortable Categories

| Type | Build Cost | Notes |
|------|-----------|-------|
| **Memory Game** | Low | Shuffle array, flip cards on click, check pair match; ~100 lines TS |
| **Sortable Categories** | Low–Med | Drag items into labeled groups (combine SortableJS + logic); ~150 lines TS |
| **Sentence Transformation** | Med–High | Parser/transformer for grammar (passive/active, tense); highly domain-specific; consider manual authoring or rule-based templating |

---

### Summary Table: Build vs. Library Decision

| Exercise Type | Auto-Checkable | Recommended Approach | Library | Build Time | Notes |
|---|---|---|---|---|---|
| **Gap-fill / Cloze** | ✓ | Build from scratch | None | ⏱ Low (1–2 hrs) | Trivial form validation |
| **Multiple Choice** | ✓ | Build from scratch | None | ⏱ Low (1 hr) | Simple radio/checkboxes |
| **Drag-and-drop matching** | ✓ | Use SortableJS | SortableJS (MIT) | ⏱ Low–Med (4–6 hrs) | Setup + answer key logic |
| **Drag-to-order** | ✓ | Use SortableJS | SortableJS (MIT) | ⏱ Low–Med (4 hrs) | Simpler than matching |
| **Dropdown-in-text** | ✓ | Build from scratch | None | ⏱ Low (2 hrs) | HTML `<select>` + validation |
| **Mark-the-words** | ✓ | Build from scratch | None | ⏱ Low (3 hrs) | Clickable spans + tracking |
| **Crossword** | ✓ | Use H5P or Library | Crossword Layout Gen (MIT) | ⏱ Med–High (8–12 hrs from scratch) | Library saves algorithmic complexity |
| **Word search** | ✓ | Use library or build | Wordfind.js (MIT) | ⏱ Med (4–6 hrs build) | Library simple; generation straightforward |
| **Memory / Pairs** | ✓ | Build from scratch | None | ⏱ Low (3 hrs) | Card flip + pair matching logic |
| **Image hotspots** | ✓ | Build from scratch | None (use HTML `<map>`) | ⏱ Low (2–3 hrs) | HTML5 `<map>` + SVG click areas |
| **Flashcards** | ✓ | Build from scratch | None (avoid ts-fsrs/AGPL) | ⏱ Low–Med (3–4 hrs) | Simple flip + localStorage; no algorithm needed for MVP |
| **Error correction** | ✓ | Build from scratch | None | ⏱ Low–Med (4 hrs) | Regex + string comparison |
| **Sortable categories** | ✓ | Use SortableJS | SortableJS (MIT) | ⏱ Med (5–6 hrs) | Combine library with grouping logic |
| **Sentence transformation** | ~ Partial | Build bespoke or use H5P | None (or custom templates) | ⏱ High (12+ hrs) | Too domain-specific; consider manual authoring |
| **Dictation** | ~ Manual (exact match) | Use Annyang (cloud) or Pocketsphinx (offline) | Annyang (MIT) or Pocketsphinx.js (MIT) | ⏱ Med (6–8 hrs) | Speech Recognition API integration |
| **Dialogue / Branching** | ~ Manual | Build or use H5P | None simple; H5P Branching Scenario | ⏱ High (12+ hrs) | Requires story structure + logic branching |
| **Question Set** | ✓ | Use H5P | H5P (MIT + optional GPL) | ⏱ Med (bundling) | Combines multiple types; simplest multi-question approach |

---

## PART C: Synthesis & Recommendations for Grade 7 English MVP

### Tier 1: Highest Value, Lowest Cost (Start Here)

**Goal:** 4 exercise types, auto-checkable, build in ~2–3 weeks, sufficient for initial classroom validation.

| Exercise Type | Build Approach | Tool | Est. Time | Rationale |
|---|---|---|---|---|
| **1. Gap-fill (Cloze)** | Build from scratch in TS | None | ⏱ 4–6 hrs | Essential for reading + grammar practice; straightforward form |
| **2. Multiple Choice Quiz** | Build from scratch in TS | None | ⏱ 2–3 hrs | Covers listening, vocab, grammar; fastest ROI |
| **3. Drag-and-drop Matching** | Use SortableJS (MIT) | SortableJS | ⏱ 6–8 hrs | High engagement, vocabulary + grammar; library proven |
| **4. Crossword** | Use H5P (MIT) or Crossword Layout Generator (MIT) | H5P or Generator | ⏱ 4–6 hrs (H5P) / 8–10 hrs (scratch) | Vocabulary retention; H5P reduces algorithmic burden |

**Total build time:** ~16–27 hrs  
**Coverage:** Reading, grammar, vocabulary; listening (if audio cues added to MC)  
**Cost:** $0 (all libraries MIT)  
**Offline:** ✓ Yes, fully self-contained HTML per file

### Tier 2: Expanding Reach (Weeks 4–6)

Add flashcards, word search, error correction:

| Exercise Type | Build Approach | Tool | Est. Time |
|---|---|---|---|
| **5. Flashcards** | Build from scratch (flip + localStorage) | None | ⏱ 3–4 hrs |
| **6. Word Search** | Use Wordfind.js (MIT) | Wordfind.js | ⏱ 4–6 hrs |
| **7. Error Correction** | Build from scratch (validation logic) | None | ⏱ 4–5 hrs |

### Tier 3: Optional / Advanced (Phase 2+)

- **Dictation:** Annyang (MIT) + speech integration if classroom has adequate audio setup
- **Image hotspots:** For vocabulary labeling (low effort, good for visual learners)
- **Sortable categories:** Word families, parts of speech grouping
- **Full H5P deployment:** If you want one tool to manage all exercise types (easier teacher experience, heavier file size)

---

## Decision: H5P vs. Custom Build

### Go with H5P if:
- ✅ You want one unified platform to create all exercise types (teacher authoring experience)
- ✅ You prefer zero coding for exercise content creation
- ✅ You're willing to use h5p-standalone for offline self-contained HTML export
- ✅ You need branching scenarios or interactive video (advanced features)

### Go with custom TS widgets if:
- ✅ You want minimal library dependencies and maximum control
- ✅ File size / performance is critical (custom is ~20–50 KB per widget; H5P exports ~1–2 MB)
- ✅ You need tight integration with custom DE↔EN mediation logic
- ✅ You prefer building incrementally (Tier 1 → Tier 2 → Tier 3)

**Recommendation for this project:** **Hybrid approach.**
- **Tier 1 (MVP):** Build custom TS widgets (gap-fill, MC, drag-drop, crossword via library)
- **Tier 2 (classroom feedback):** Consider H5P Question Set for rapid multi-question bundling
- **Rationale:** Custom widgets validate pedagogy quickly; H5P added later if teacher needs content-authoring speed

---

## Implementation Checklist: Tier 1 MVP

- [ ] Set up TS build pipeline (Vite or esbuild) for single-file HTML output
- [ ] **Widget 1: Gap-fill.** Form inputs + regex/exact-match validation; localStorage persistence
- [ ] **Widget 2: Multiple Choice Quiz.** Radio buttons or images; array of correct answer indices
- [ ] **Widget 3: Drag-and-drop.** SortableJS integration + mapping learner drop zones to correct items
- [ ] **Widget 4: Crossword.** Use Crossword Layout Generator library; call grid generator, render SVG, validate fills
- [ ] Test all widgets offline (file:// URLs) and on GitHub Pages
- [ ] Gather grade-7 user feedback (3–5 sample users) on exercise clarity & difficulty
- [ ] Refine before Tier 2

---

## Sources & References

### H5P
- [H5P Licensing](https://h5p.org/licensing)
- [H5P Content Types Examples](https://h5p.open.ubc.ca/h5p-examples/)
- [H5P Standalone GitHub](https://github.com/tunapanda/h5p-standalone)
- [H5P Core on GitHub](https://github.com/h5p/)

### Libraries
- [SortableJS](https://github.com/SortableJS/Sortable) — MIT
- [interact.js](https://interactjs.io/) — MIT
- [Wordfind.js](https://github.com/bunkat/wordfind) — MIT
- [Crossword Layout Generator](https://github.com/MichaelWehar/Crossword-Layout-Generator) — MIT OR Apache-2.0
- [Annyang](https://github.com/TalAter/annyang) — MIT
- [Pocketsphinx.js](https://syl22-00.github.io/pocketsphinx.js/) — MIT + BSD

### EFL/ESL Pedagogy & Standards
- [CEFR Language Learner Levels Guide (2026)](https://tahricteaches.com/the-7-levels-of-language-learner-a-complete-cefr-guide-2026/)
- [ESLeSchool Interactive Resources](https://www.esleschool.com/)
- [British Council LearnEnglish Teens](https://learnenglishteens.britishcouncil.org/)
- [TeachingEnglish Test Question Types](https://www.teachingenglish.org.uk/professional-development/teachers/assessing-learning/test-question-types)

### Grammar Exercise Design
- [Generation and Evaluation of English Grammar Multiple-Choice Cloze Exercises](https://aclanthology.org/2024.clicit-1.39/)
- [Question Type, Cognitive Load, and CEFR Alignment (2026)](https://arxiv.org/pdf/2606.01592)

