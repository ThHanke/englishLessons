# English Lesson Planner — System Specification (v0.1)

Status: DRAFT v0.2 — research folded in, passed a 4-persona ce-doc-review (2026-07-24).
Scope: tooling to help an English teacher at a German Sekundarschule (Saxony-Anhalt)
plan a full school year and generate lessons + student materials that stay compliant
with the ministry curriculum (Fachlehrplan).

## 1. Problem

A teacher must:
1. Turn a ministry curriculum (`docs/lecture_plans/*.md`) into a concrete, teachable
   year plan for a specific class. **Scope: grades 5, 6, 7 (Sekundarschule).** This
   spans a curriculum seam: grades 5/6 are a single combined band (no track); grade 7 is
   where the Realschule / Hauptschule tracks split (see 01-data-model.md §3.1 and roadmap scope note).
2. Project that plan onto the real German school calendar (starts after summer break),
   accounting for holidays, project weeks, sports days, exams, and pace variation.
3. For any chosen date, know which module/topic is active and export a precise lesson
   spec that fits the surrounding plan.
4. Generate a lesson plan (for the teacher) plus interactive materials (for pupils)
   from that spec, as linkable HTML artifacts tied back to the date.
5. Repeat this for additional classes/grades/tracks without rewriting the system.

## 2. Design principles

- **The scaffold is the product; generation is a commodity.** Text/exercise generation
  by an LLM is already solved and tunable — it is NOT the hard part and NOT the risk.
  The novel value this system creates is the *context envelope*: knowing where in the
  school year a date falls, what was taught before it, and what the sequence demands
  next, so generic generation produces material that actually fits a continuous year.
  Ad-hoc prompting fails precisely because it lacks this envelope. Building the envelope
  is the point. Corollary: the **continuity mechanism** (`prior_covered` accumulation +
  per-module known-vocab, §3.4/§3.6) is load-bearing and must be honored at generation
  time, never cut.
- **Curriculum is the source of truth.** Every module goal, milestone, and exercise
  traces back to a competence ID extracted from the Lehrplan. No orphan content. The
  controlled vocabulary is itself *derived* from the curriculum by an agent (§3.6), so
  no manual word-listing or textbook is required.
- **Deterministic core, generative edges.** Calendar projection and plan math are
  pure, testable, non-AI code. Lesson/material generation is AI (skills/agents). Note:
  curriculum *extraction* (Component A) is a mix — the table-to-entry mapping is
  deterministic, but the semantic decomposition of bundled prose (splitting one Lehrplan
  bullet into per-item, per-mode competences) is AI-assisted with mandatory human review
  before IDs freeze (§3.1). It is not a pure deterministic parse.
- **Data as files, not a database (v1).** Everything is versioned YAML/JSON/Markdown
  in the repo. Git is the history and audit trail. A DB can come later.
- **Extensible by adding files, not code.** New class = new plan file. New exercise
  type = new skill. The engine iterates over what exists.
- **Offline-first, license-clean.** Prefer static HTML artifacts and dependency-light
  tooling. All third-party assets/libraries must be permissively licensed (research
  pass gates this).

## 3. Component map

| # | Component | Type | Consumes | Produces |
|---|-----------|------|----------|----------|
| A | Curriculum model | data + parser | Lehrplan `.md` | `curriculum/*.yaml` (competence graph) |
| B | Year-plan template | data | curriculum | `plans/<class>/modules.yaml` (module sequence, goals, milestones) |
| C | School-year calendar | data | official Ferien/holiday dates | `calendar/<year>.yaml` (weeks, events, pace factors) |
| D | Projection engine | deterministic code | B + C | week→module map, "where are we now", drift alerts |
| E | Lesson-spec exporter | code + skill | D + curriculum | `lesson-spec.json` for a date |
| O | **`prepare-lesson` orchestrator** (primary interface) | skill/agent | D + prior lessons | drives the conversation → E/G/H, confirm step, textbook-ref step (§4.6); surfaced via companion chat (§4.5) |
| G | Lesson generator | skill/agent | `lesson-spec.json` | `lesson-plan.html` + `materials/*.html` |
| H | Exercise-type skills | skills | lesson plan slice | one interactive HTML widget each |
| I | Artifact registry | data | G/H/O outputs | dated static pages under `/classes/<class>/<date>/` |
| F | **Teacher companion** (calendar + chat) | local Express/React app | D + I + Agent SDK | interactive calendar (SVAR) with multi-grade overlay; drag-create lesson series per half-year; click appointment → context panel → chat; generated artifacts served statically after `git push` (§4.1, §4.5, §4.7) |

Interface note: the teacher works through the **companion app** (F) — a local
Express/React application with an interactive calendar and embedded chat. Clicking a
calendar appointment shows module context; clicking "Plan lesson" opens a chat session
seeded with that date's projection/coverage data and backed by the Claude Agent SDK.
The chat has access to pedagogical skills that produce lesson specs and materials.
Generated artifacts are committed and served statically via GitHub Pages after
`git push`. See `03-generation.md` §4.1, §4.5–4.7.

See `01-data-model.md` for schemas, `02-projection.md` for calendar math,
`03-generation.md` for the skill/agent pipeline, `04-roadmap.md` for phasing and
the open questions the research pass must answer, and
`06-exercise-design-reference.md` for the official task formats + design criteria that
ground the exercise/test skills.

Grounded legal/curricular sources live in `docs/rules/`
(Leistungsbewertungserlass; RSA exam structure + Anforderungsbereiche) and
`docs/lecture_plans/` (Fachlehrplan). Copyright-protected source tasks (LISA NbA) are
never committed — a teacher's own licensed copy sits in gitignored `material/`.
