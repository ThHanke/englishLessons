---
name: curriculum-decompose
description: Stage-2 AI-assisted semantic decomposition of Lehrplan raw rows into typed curriculum entries (competence, grammar_item, content_field, text_type, hint_method). Use after running the stage-1 table mapper (src/extract/tableMapper.ts) to produce a *.draft.yaml grade-band file for human review.
---

# Curriculum semantic decomposition (Stage 2)

Turns stage-1 raw rows (`{band, area, subarea, bereich, bulletText, sourceLine}`) into the
typed, band-local-ID entries defined in `src/schema/types.ts` and shaped per
`docs/spec/01-data-model.md` §3.1. This is AI-assisted, not deterministic — a regex/table
reader cannot reliably split bundled prose (e.g. one Grammatik bullet naming three tenses
with different modes) into per-item, per-mode entries.

## Inputs

- Raw rows for one band, produced by `extractBand56Rows` / `extractBand78RealschuleRows`
  (`src/extract/tableMapper.ts`) run against
  `docs/lecture_plans/sachsen-anhalt-sekundarschule-englisch-lehrplan-2019-08-01.md`.
- The mode/depth mapping table (plan HTD, mirrored below).

## Mode/depth mapping

| Lehrplan verb | `mode` |
|---|---|
| verstehen / erkennen / erfassen / entnehmen | `understand` |
| formulieren / anwenden / bilden / wiedergeben / vorlesen / vortragen | `produce` |
| both listed (verstehen … und formulieren) | `[understand, produce]` |

## Row -> entry type mapping

| Raw row (`area` / `subarea` / `bereich`) | Entry type | ID prefix | Notes |
|---|---|---|---|
| `funktional_kommunikativ` / `kommunikative_kompetenzen` / Hör-, Lese-, Sprechen-, Schreiben-, Sprachmittlung | `competence` | `fk.k.<skill_slug>.<n>` | `skill_area`: hoer→listening, lesen→reading, sprechen→speaking, schreiben→writing, sprachmittlung→mediation |
| `funktional_kommunikativ` / `sprachliche_mittel` / Grammatik | `grammar_item` | `fk.g.<topic_slug>` | **The hard case.** One bullet often bundles several tenses/topics with different per-clause modes — split into one `grammar_item` per topic, each with its own `mode`. |
| `funktional_kommunikativ` / `sprachliche_mittel` / Wortschatz | `grammar_item`-shaped (functional language, not lexis) | `fk.w.<slug>` | Communicative functions ("introduce oneself"), not vocabulary — vocabulary itself is agent-generated later (U6/§3.6a), never taken from here. |
| `funktional_kommunikativ` / `sprachliche_mittel` / Aussprache und Intonation | same shape | `fk.a.<slug>` | |
| `funktional_kommunikativ` / `sprachliche_mittel` / Orthografie | same shape | `fk.o.<slug>` | |
| `funktional_kommunikativ` / `kommunikative_inhalte` / * | `content_field` | `c.<field_slug>.<slug>` | `field`: German Bereich name slugified (persoenliches_umfeld, soziales_umfeld, alltagsleben, natur, …) |
| `funktional_kommunikativ` / `textsorten` / nur rezeptiv, produktiv | `text_type` (flat name list, §3.1 concrete shape — no per-item id/source) | n/a | Split the *specific examples* in parentheses (z. B. …) into individual slugs, not the category label. A trailing example with no parenthetical list becomes its own slug (e.g. `film_clip`). |
| `interkulturell` / `anforderungen` / * | `competence`, `skill_area: intercultural` | `ik.a.<slug>` | Skill-requirement statements. |
| `interkulturell` / `orientierungswissen` / * | `content_field` | `ik.o.<field_slug>.<slug>` | Topic/content knowledge, same shape as kommunikative Inhalte. |
| `methodisch` / * | `hint_method` | `m.<bereich_slug>.<n>` | "gute-Aufgaben" / Texterschließung / methodical competences. |

Every emitted entry carries `id`, `source: { doc, location }` (doc = the Lehrplan filename,
location = `l<sourceLine>` from the raw row), and `used_in` (best-guess tags from
`{module_construction, lesson_planning, base_material, test_generation}` — competences and
grammar items always include `module_construction`; add `test_generation` for produce-mode
items that are plausible assessment targets).

## Grammatik decomposition worked example (5/6 band)

Raw bullet: *"Handlungen, Ereignisse und Sachverhalte als gegenwärtig (simple present und
present progressive), vergangen (simple past) und zukünftig (going to future, will-future)
erkennen und wiedergeben sowie das simple present perfect verstehen"*

Splits into six `grammar_item`s: `fk.g.simple_present`, `fk.g.present_progressive`,
`fk.g.simple_past`, `fk.g.going_to_future`, `fk.g.will_future` — all
`mode: [understand, produce]` (erkennen + wiedergeben apply to all three time groups) — and
`fk.g.present_perfect` with `mode: [understand]` only (the bullet explicitly isolates it with
"sowie … verstehen").

## Procedure

1. Run the stage-1 mapper on the real Lehrplan for the target band.
2. Group raw rows by `(area, subarea, bereich)`.
3. For each group, apply the row → entry mapping table above. For Grammatik/Wortschatz/etc.
   bundled bullets, split per the mode/depth table — never merge two topics with different
   modes into one entry.
4. Assign sequential band-local IDs per bereich (e.g. `fk.k.hoer.1`, `fk.k.hoer.2`, …).
5. Write `curriculum/<curriculum-id>/grade-bands/<band>.draft.yaml` (never overwrite the
   committed file directly — KTD3).
6. Human reviews the draft against `docs/extraction-workflow.md`'s checklist, requests fixes,
   then the reviewer (or the agent under explicit instruction) copies the accepted draft to
   the canonical path and the IDs are frozen.
