# Curriculum extraction workflow

Two-stage extraction (01-data-model §3.1, plan KTD2/KTD3). Applies to every
`curriculum/**/grade-bands/*.yaml` file.

## Stage 1 — deterministic table mapper

`src/extract/tableMapper.ts` reads the Lehrplan markdown and emits raw, unin­terpreted rows
(`{band, area, subarea, bereich, bulletText, sourceLine}`). Pure function, fully covered by
`tableMapper.test.ts`. Re-running stage 1 is always safe — it never touches committed files.

## Stage 2 — AI-assisted semantic decomposition

`.claude/skills/curriculum-decompose/SKILL.md` splits bundled prose into per-item, per-mode
typed entries and assigns provisional band-local IDs (KTD4). Because this step requires
judgment (splitting bundled grammar bullets, assigning modes, English-slugging German terms),
**IDs are frozen only after human review.**

## Draft-to-diff rule (KTD3 — hard rule)

- A fresh decomposition run writes `curriculum/<curriculum-id>/grade-bands/<band>.draft.yaml`.
  It **never overwrites** the committed `<band>.yaml` directly.
- The committed, git-tracked `<band>.yaml` is the canonical source of truth once reviewed.
- To accept a draft: diff `<band>.draft.yaml` against the committed `<band>.yaml` (or, for a
  first extraction, against nothing — the draft becomes the initial committed file after
  review), resolve every discrepancy, then copy/rename the draft over the committed path and
  delete the `.draft.yaml` (git-ignored, see `.gitignore`).
- A manual override file may be layered on top for one-off fixups without re-running the full
  decomposition.
- Never silently regenerate a frozen ID. If decomposition logic changes and would reassign an
  ID, treat it as a breaking change requiring explicit review — downstream `modules.yaml` and
  `vocabulary/*.yaml` files cite these IDs.

## Review checklist (sign off before freezing)

For each grade-band file:

- [ ] Every bundled bullet (one Lehrplan cell describing multiple grammar topics/skills) was
      split into separate entries — no entry's `topic`/`statement` still names two distinct
      grammar topics.
- [ ] Every entry has `id`, `source` (doc + line), and `used_in`.
- [ ] `mode` values match the mode/depth table (verstehen/erkennen/erfassen → understand;
      formulieren/anwenden/bilden/wiedergeben → produce; both → both).
- [ ] IDs are band-local and unique within the file (no duplicate IDs).
- [ ] No content from an out-of-scope section leaked in (e.g. no §3.3 Hauptschule content in
      any in-scope band file; no grade 8/9/10-only content presented as grade-7 curriculum
      before the U7 module derivation step decides grade-7 vs grade-8 scope).
- [ ] `meta.yaml` `cefr_target`, `valid_from`, and `source_file` are correct for the band.

Band-specific checklist items (from the plan):

- **5-6.yaml**: `simple present perfect` carries `mode: [understand]` only, not produce.
- **7-8-realschule.yaml**: `conditional_1` has `mode: [understand, produce]` while
  `conditional_2` has `mode: [understand]`; `question_tag` is understand-only; `passive`
  carries both modes; all IDs are distinct from the 5-6 band's IDs (different band file, so no
  literal collision risk, but topic overlap like `present_perfect` should be double-checked
  for a distinct band-scoped ID).

Once every box is checked, the reviewer accepts the draft (or the agent copies it over the
canonical path under explicit reviewer instruction) and the IDs are frozen for that band.

## Vocabulary chain review (U6, KTD3/KTD8)

Same draft-to-diff discipline applies per-grade to `vocabulary/<grade>.yaml`, plus:

- Generation is **chain-ordered**: grade 5 must be reviewed and frozen before grade 6
  generates (grade 6's "already known, exclude" set depends on grade 5 being final), and
  likewise grade 6 before grade 7.
- Review confirms the NGSL leveling flags (`src/vocab/leveling.ts`) are resolved — either
  accepted (in NGSL / CEFR-fallback approved) or removed — before the grade's list is marked
  accepted.
- Review confirms no word in the new grade's lists already appears in an inherited
  (`inherits_from`) grade's cumulative set (no re-introduction).
