---
title: "feat: Pedagogical skills for companion agent"
type: feat
status: done
date: 2026-07-27
---

# feat: Pedagogical skills for companion agent

## Overview

The companion agent can plan lessons and create exercises, but has no pedagogical methodology guiding HOW it builds them. This adds a set of `.claude/skills/` files — one per pedagogical concern — that the agent invokes when building lesson plans, exercises, tests, and homework. Skills are original implementations informed by educational research (Rosenshine, Hattie, Tomlinson, Beck/McKeown/Kucan, Gibbons, Wiggins/McTighe) and adapted from permissively licensed repos (Anthropic k12-teacher-skills, Apache 2.0; YujxZJCN/teaching-skills, MIT). GarethManning/education-agent-skills (CC BY-SA 4.0) is used as research reference only — no direct adaptation.

## Problem Frame

The agent's COMPANION_INSTRUCTIONS say "create exercises" but give no methodology for:
- How to scaffold tasks for EAL learners (all students are German L1 / English L2)
- How to structure warm-up retrieval practice
- How to design error correction exercises with realistic, targeted misconceptions
- How to sequence difficulty within an exercise set
- How to select vocabulary for explicit teaching vs assumed knowledge
- How to design assessments aligned to competences and milestones
- How to open a lesson with structured prior-knowledge activation

The result: exercise quality depends entirely on the base model's generic pedagogical knowledge. Adding skill files gives the agent a structured, evidence-based methodology for each concern.

## Requirements Trace

- R1. Agent has access to pedagogical skills that guide exercise and plan generation
- R2. Skills integrate with existing LessonSpec, coverage gaps, vocabulary.yaml, and exercise types
- R3. Skills follow `.claude/skills/<name>/SKILL.md` convention — auto-discovered by SDK
- R4. COMPANION_INSTRUCTIONS updated to tell agent when to invoke each skill
- R5. Skills are original implementations; attribution in `docs/ACKNOWLEDGMENTS.md`
- R6. Skills use the agent's existing context (dateContext, modules.yaml, vocabulary.yaml) rather than requiring new data sources

## Scope Boundaries

- No new MCP tools — skills are prompt-only guidance the agent invokes via the `Skill` tool
- No changes to `artifactTools.ts`, `buildLedger.ts`, or coverage pipeline
- No frontend changes
- No changes to `dateContext.ts` — skills work with the context the agent already receives
- Skills are English-teaching specific (German secondary, Sachsen-Anhalt curriculum), not generic

### Deferred to Separate Tasks

- Exercise-type HTML widget skills (§4.3 skill-per-exercise-type): separate feature, builds on this foundation
- Spaced practice scheduling: needs cross-lesson scope, currently out of companion's single-lesson boundary
- Student work gap analysis: needs practiced/assessed depth upgrades (deferred feature)
- `prepare-lesson` orchestrator (§4.6): separate feature, will compose these skills

## Context & Research

### Relevant Code and Patterns

- `.claude/skills/curriculum-decompose/SKILL.md` — existing skill pattern: YAML frontmatter (`name`, `description`), markdown body with sections, inputs, and step-by-step procedures
- `src/companion/server/agentSession.ts:54-100` — COMPANION_INSTRUCTIONS, appended to system prompt
- `src/companion/server/agentSession.ts:23-26` — `settingSources: ["user", "project"]` enables skill discovery
- `src/companion/server/agentSession.ts:13-19` — `DISALLOWED_TOOLS` does NOT include `Skill` — agent can invoke skills
- `src/companion/server/dateContext.ts` — `TeachingDayContext` with phase, gaps, lessonSpec, moduleGoals, weekInModule
- `vocabulary/grade-*.yaml` — controlled word lists keyed by module ID
- `plans/<grade>/modules.yaml` — module goals, covers[], pedagogy.new_grammar[]
- `docs/spec/03-generation.md:86-111` — 15 exercise types with competence hooks

### Adapted Sources (permissive licenses)

- `anthropics/k12-teacher-skills` (Apache 2.0): lesson planning workflow (5-step), differentiation framework (R1-R8, 3-tier below/at/above), density rules, classroom-readiness checks
- `YujxZJCN/teaching-skills` (MIT): assessment-architect blueprint-before-items methodology, lesson-builder backward dependency to outcomes, `[VERIFY]` marker pattern

### Research References (inspiration only, CC BY-SA 4.0)

- `GarethManning/education-agent-skills`: scaffolded-task-modifier (EAL scaffolding preserving cognitive demand), retrieval-practice-generator (free recall/cued recall/recognition calibrated to time-since-learning), erroneous-example-designer (realistic errors targeting specific misconceptions), vocabulary-tiering-tool (Beck's 3-tier model), sentence-frame-generator (Gibbons' scaffolding), lesson-opening-designer (Rosenshine's daily review), practice-problem-sequence-designer (near-to-far transfer)

## Key Technical Decisions

- **Skills as `.claude/skills/` files, not inline COMPANION_INSTRUCTIONS sections**: Skills are modular — each can be updated independently. COMPANION_INSTRUCTIONS stays a routing layer ("when you need to scaffold an exercise, invoke the `eal-scaffold` skill"). This avoids bloating the system prompt beyond the SDK's effective range. Skills load on-demand when the agent calls `Skill`.
- **One skill per pedagogical concern, not per exercise type**: A skill like `eal-scaffold` applies across ALL exercise types. A skill like `retrieval-warm-up` applies to the warm-up phase of ANY lesson. This is a cross-cutting concern layer, not the exercise-type skill layer from §4.3.
- **Skills reference existing data by path convention**: Skills tell the agent "read `plans/<grade>/vocabulary.yaml`" and "use the gaps from your seed context" rather than receiving data through new parameters. The agent already has file access (Read, Glob) and receives dateContext.
- **German→English EAL specificity**: Skills are written for German L1 students learning English, not generic EAL. Sentence frames include German cognate awareness. Vocabulary tiering accounts for German-English false friends. Scaffolding references Sachsen-Anhalt curriculum levels (A1-B1).
- **COMPANION_INSTRUCTIONS gets a "Skills" routing section**: A concise section that maps situations → skill names, so the agent knows which skill to invoke without reading all skill files upfront.

## Open Questions

### Resolved During Planning

- **Should skills be inline or separate files?** Separate `.claude/skills/` files. COMPANION_INSTRUCTIONS is already ~100 lines. Adding 8 skill descriptions would push it to 500+ lines, diluting the system prompt. Separate files load on-demand.
- **Can the agent invoke Skill?** Yes — `Skill` is not in `DISALLOWED_TOOLS`. Verified: the SDK discovers skills from `.claude/skills/*/SKILL.md` when `settingSources: ["user", "project"]` is set.
- **Do we need to adapt the full Anthropic k12 lesson-planning skill?** No — it's designed for US K-12 with Word doc rendering and Learning Commons KG. We adapt the pedagogical methodology (5-step workflow, density rules, classroom-readiness) but not the rendering pipeline.

### Deferred to Implementation

- Exact sentence frame templates for each CEFR level — will be refined when testing with real lesson contexts
- Whether vocabulary.yaml needs a `tier` field added for Beck's tiering — likely not for v1, skill can infer from frequency

## Output Structure

```
.claude/skills/
  eal-scaffold/SKILL.md           # EAL task scaffolding (foundational, cross-cutting)
  retrieval-warm-up/SKILL.md      # Structured warm-up with retrieval practice
  error-correction-design/SKILL.md # Designing error correction exercises
  difficulty-progression/SKILL.md  # Sequencing difficulty within exercise sets
  vocab-teaching/SKILL.md          # Vocabulary selection and tiering for explicit instruction
  sentence-frames/SKILL.md         # Sentence frame generation for productive skills
  lesson-opening/SKILL.md          # Evidence-based lesson opening design
  assessment-design/SKILL.md       # Test/quiz blueprint and item design
src/companion/server/
  agentSession.ts                  # MODIFY — add Skills routing section to COMPANION_INSTRUCTIONS
docs/
  ACKNOWLEDGMENTS.md               # MODIFY — already created, verify up to date
```

## Implementation Units

- [x] **Unit 1: `eal-scaffold` skill — EAL task scaffolding**

**Goal:** Foundational skill that guides the agent in scaffolding any exercise for German L1 / English L2 learners while preserving cognitive demand.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `.claude/skills/eal-scaffold/SKILL.md`

**Approach:**
- Methodology adapted from Gibbons' scaffolding framework and Tomlinson's differentiation (modify route, not destination)
- Input: exercise content + target CEFR level (from dateContext)
- Procedure: analyze language barriers, apply scaffolds (word banks, sentence starters, German cognate hints, visual supports), verify cognitive demand unchanged
- Output guidance: scaffold types applied, removal plan for progressive independence
- German-English specific: false friend warnings, cognate leveraging, L1 transfer patterns for each CEFR level
- Reference vocabulary.yaml for controlled word lists

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md` for frontmatter and structure

**Test expectation:** none — skill file (prompt text), not code

**Verification:**
- Agent invokes `eal-scaffold` when creating exercises and applies CEFR-appropriate scaffolding
- Scaffolds include German-specific supports (cognates, false friend warnings)

---

- [x] **Unit 2: `retrieval-warm-up` skill — structured warm-up design**

**Goal:** Skill that guides the agent in designing the first 5-8 minutes of a lesson with structured retrieval practice targeting prior coverage.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `.claude/skills/retrieval-warm-up/SKILL.md`

**Approach:**
- Methodology from Rosenshine's daily review principle, testing effect research
- Input: prior_covered competences from dateContext, module goals, week_in_module
- Procedure: select 3-5 retrieval items mixing free recall, cued recall, and recognition; calibrate difficulty to time-since-learning (recent = free recall, older = cued/recognition); include one item from 2+ weeks ago for spaced practice
- Output: timed warm-up activity (5-8 min) with answer key
- Connects to coverage gaps: prioritize retrieval on competences that need "more depth"

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md`

**Test expectation:** none — skill file only

**Verification:**
- Agent invokes when planning warm-up phase
- Warm-up includes items calibrated to recency and gap priority

---

- [x] **Unit 3: `error-correction-design` skill — error correction exercise design**

**Goal:** Skill for designing error correction exercises with deliberate, realistic errors targeting specific grammar misconceptions common to German L1 learners.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `.claude/skills/error-correction-design/SKILL.md`

**Approach:**
- Methodology: erroneous examples research (delayed but superior retention when errors are realistic and common)
- Input: target grammar competences from lesson-spec focus_competences
- Procedure: identify 3-5 common German→English transfer errors for each grammar topic (e.g., word order after subordinating conjunctions, false friends, article usage); create sentences with ONE realistic error each; pair with scaffolded analysis prompts (find it → explain why → correct it); include teacher answer key with misconception explanations
- German-specific error catalog: L1 transfer errors (V2 word order, present perfect vs Perfekt, preposition collocations)

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md`

**Test expectation:** none — skill file only

**Verification:**
- Agent invokes for `error_correction` exercise type
- Errors are realistic German L1 transfer errors, not random mistakes

---

- [x] **Unit 4: `difficulty-progression` skill — exercise difficulty sequencing**

**Goal:** Skill for sequencing exercises within a set from near-transfer to far-transfer with graduated difficulty.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `.claude/skills/difficulty-progression/SKILL.md`

**Approach:**
- Methodology: worked example fading (Sweller), desirable difficulties research, near→far transfer
- Input: exercise type + target competences + CEFR level
- Procedure: start with recognition tasks close to worked examples, progress through guided production to free production; define 3 difficulty bands (supported → guided → independent); specify what changes between bands (scaffold removal, context variation, cognitive demand increase); warn against "expertise reversal" (over-scaffolding advanced learners)
- Integrates with eal-scaffold: difficulty band 1 gets maximum scaffolding, band 3 gets minimal

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md`

**Test expectation:** none — skill file only

**Verification:**
- Agent produces exercise sets with visible progression from supported to independent
- Each exercise in a set is harder than the previous

---

- [x] **Unit 5: `vocab-teaching` skill — vocabulary selection and tiering**

**Goal:** Skill for selecting which vocabulary to explicitly teach vs assume, using Beck's tiering model adapted for German→English EAL context.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `.claude/skills/vocab-teaching/SKILL.md`

**Approach:**
- Methodology: Beck/McKeown/Kucan vocabulary tiers adapted for L2 context
- Input: lesson topic + target competences + vocabulary.yaml reference
- Procedure: classify target vocabulary into Tier 1 (high-frequency, likely known), Tier 2 (academic, high-leverage — explicit teaching priority), Tier 3 (technical, pre-teach only if needed); for each Tier 2 word: definition, example in context, German cognate/false-friend check, word family; reference `vocabulary/<grade>.yaml` to check cumulative known vocabulary
- German-specific: cognate leveraging (Tier 2 words with German cognates are easier to acquire), false friend flagging (e.g., "become" ≠ "bekommen")
- Output: word cards with definition, context, and collocations; quick-check activity

**Patterns to follow:**
- `.claude/skills/vocab-generate/SKILL.md` — existing vocabulary skill pattern

**Test expectation:** none — skill file only

**Verification:**
- Agent invokes when vocabulary is part of lesson focus
- Output distinguishes Tier 1/2/3 with teaching prioritization

---

- [x] **Unit 6: `sentence-frames` skill — sentence frame generation**

**Goal:** Skill for generating proficiency-graded sentence frames for productive tasks (speaking, writing, mediation).

**Requirements:** R1, R2, R6

**Dependencies:** Unit 1 (builds on eal-scaffold methodology)

**Files:**
- Create: `.claude/skills/sentence-frames/SKILL.md`

**Approach:**
- Methodology: Gibbons' scaffolding principles, Zwiers' academic language functions
- Input: task type (dialogue/writing_prompt/mediation) + target CEFR level + target competences
- Procedure: generate frames graded by proficiency (A1: full sentence with one blank, A2: sentence starter, B1: discourse marker + open ending); frames encode thinking structure, not just grammar; include paired discourse markers; provide progression plan toward independent writing
- German-specific: frames that bridge German sentence structure habits toward English patterns
- Maps to exercise types: `dialogue` (turn-taking frames), `writing_prompt` (paragraph structure frames), `mediation` (transfer frames with source/target language slots)

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md`

**Test expectation:** none — skill file only

**Verification:**
- Agent invokes for dialogue, writing_prompt, and mediation exercises
- Frames are graded by CEFR level with visible progression

---

- [x] **Unit 7: `lesson-opening` skill — evidence-based lesson opening design**

**Goal:** Skill for designing the first 8-12 minutes of a lesson with retrieval starter, prior knowledge bridge, and learning intention.

**Requirements:** R1, R2, R6

**Dependencies:** Unit 2 (extends retrieval-warm-up with full opening structure)

**Files:**
- Create: `.claude/skills/lesson-opening/SKILL.md`

**Approach:**
- Methodology: Rosenshine's daily review, Ausubel's advance organizers
- Input: today's topic + previous learning (from prior_covered) + target competences + phase
- Procedure: 3-part opening — (1) retrieval starter 5-6 min (invoke retrieval-warm-up skill), (2) prior knowledge bridge connecting old→new 2-3 min, (3) learning intention stated as student-facing "I can..." statement 1 min; total 8-12 min timed script
- Phase-aware: `new_input` phase gets stronger advance organizer; `practice` phase gets heavier retrieval; `revision` phase gets diagnostic retrieval

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md`

**Test expectation:** none — skill file only

**Verification:**
- Agent invokes when building a full lesson plan
- Opening has 3 distinct parts with timing

---

- [x] **Unit 8: `assessment-design` skill — test/quiz blueprint and item design**

**Goal:** Skill for designing assessments aligned to competences and milestones using blueprint-before-items methodology.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `.claude/skills/assessment-design/SKILL.md`

**Approach:**
- Methodology adapted from YujxZJCN assessment-architect (MIT): blueprint confirmation before items, items tagged with competence ID + depth level
- Input: milestone_context (from lesson-spec: next milestone type, assesses[] competences, in_slots countdown), focus_competences
- Procedure: (1) build competence × depth matrix from assesses[] list, (2) confirm blueprint with teacher before generating items, (3) generate items per blueprint cell — each tagged with competence ID, (4) produce answer key by solving items fresh (not transcribing intent), (5) mark uncertain items `[VERIFY]`
- Maps to exercise types: items can be `mcq`, `gap_fill`, `error_correction`, `transform`, `matching` — use appropriate type for each competence
- Density rules adapted from Anthropic k12: ≤3 sentences per instruction block, items concrete and answerable

**Patterns to follow:**
- `.claude/skills/curriculum-decompose/SKILL.md`

**Test expectation:** none — skill file only

**Verification:**
- Agent invokes when teacher selects "Create test / quiz"
- Blueprint presented for confirmation before items are generated
- Items tagged with competence IDs from milestone_context.assesses[]

---

- [x] **Unit 9: Update COMPANION_INSTRUCTIONS with skills routing section**

**Goal:** Add a "Skills" section to COMPANION_INSTRUCTIONS that maps situations to skill names, so the agent knows when to invoke each pedagogical skill.

**Requirements:** R4

**Dependencies:** Units 1-8

**Files:**
- Modify: `src/companion/server/agentSession.ts`
- Test: `src/companion/server/agentSession.test.ts` (if existing tests check COMPANION_INSTRUCTIONS content)

**Approach:**
- Add `## Pedagogical skills` section after "Saving your work"
- Concise routing table: situation → skill name
- Situations: creating any exercise → `eal-scaffold`; planning warm-up → `retrieval-warm-up` + `lesson-opening`; error correction exercises → `error-correction-design`; exercise sets → `difficulty-progression`; vocabulary focus → `vocab-teaching`; dialogue/writing/mediation → `sentence-frames`; test/quiz → `assessment-design`
- Emphasize: invoke skills BEFORE generating content, not after
- Keep the section under 30 lines — it's a routing guide, not skill content

**Patterns to follow:**
- Existing COMPANION_INSTRUCTIONS section structure

**Test scenarios:**
- Happy path: COMPANION_INSTRUCTIONS contains "Pedagogical skills" section with all 8 skill names
- Happy path: each skill name matches an existing `.claude/skills/<name>/SKILL.md` file

**Verification:**
- Agent mentions skill usage in its responses when creating exercises or plans
- Type check passes (no code logic changes, just string content)

## System-Wide Impact

- **Interaction graph:** COMPANION_INSTRUCTIONS → agent reads routing → invokes Skill tool → SDK loads `.claude/skills/<name>/SKILL.md` → agent follows skill procedure → generates content → optionally saves via `save_material`/`save_lesson_spec`
- **Error propagation:** If a skill file is missing or malformed, the SDK's Skill tool returns an error → agent sees it and falls back to generic generation. No crash.
- **State lifecycle risks:** None — skills are stateless prompt files. No new state introduced.
- **Unchanged invariants:** `DISALLOWED_TOOLS` unchanged. `artifactTools.ts` unchanged. `dateContext.ts` unchanged. `buildLedger.ts` unchanged. Coverage pipeline unchanged. Frontend unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Skills make system prompt too long when multiple are invoked | Skills load on-demand via Skill tool, not all at once. Agent invokes 1-2 per task, not all 8 |
| Agent ignores skill routing and generates generically | COMPANION_INSTRUCTIONS routing section is explicit and imperative. Test with real conversations |
| Skill quality depends on research accuracy | Skills cite specific research; `[VERIFY]` marker pattern for uncertain claims. Teacher reviews all output |
| German-specific examples may be incomplete | Start with most common L1 transfer patterns. Iterate based on teacher feedback |

## Sources & References

- Adapted: `anthropics/k12-teacher-skills` (Apache 2.0) — lesson planning workflow, differentiation, density rules
- Adapted: `YujxZJCN/teaching-skills` (MIT) — assessment blueprint methodology, `[VERIFY]` pattern
- Research reference: `GarethManning/education-agent-skills` (CC BY-SA 4.0) — pedagogical methodology only
- Attribution: `docs/ACKNOWLEDGMENTS.md`
- Rosenshine, B. (2012). Principles of Instruction
- Hattie, J. & Timperley, H. (2007). The Power of Feedback
- Tomlinson, C.A. (2001). How to Differentiate Instruction
- Beck, I., McKeown, M. & Kucan, L. (2002). Bringing Words to Life
- Gibbons, P. (2002). Scaffolding Language, Scaffolding Learning
- Wiggins, G. & McTighe, J. (2005). Understanding by Design
- Sweller, J. (2011). Cognitive Load Theory
