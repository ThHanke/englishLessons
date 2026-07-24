# english_leasons

Manage and build English lesson material for Sachsen-Anhalt Sekundarschule (grades 5-7).

## Phase 0 artifacts

Data-first, TypeScript tooling layer. No database — everything is a git-tracked YAML file.

```
curriculum/sachsen-anhalt-sekundarschule-englisch-2019/
  meta.yaml                    # state, school type, subject, valid_from, CEFR targets
  grade-bands/5-6.yaml         # frozen extraction, §3.1 Schuljahrgänge 5/6 (A1 -> A2)
  grade-bands/7-8-realschule.yaml  # frozen extraction, §3.2.1 Schuljahrgänge 7/8 RS (B1)
plans/grade-{5,6,7-realschule}/
  class.yaml                   # name, grade, track, curriculum ref
  modules.yaml                 # draft topic clusters; time/calendar fields are DRAFT (Phase 1)
vocabulary/grade-{5,6,7-realschule}.yaml
  # chain-ordered controlled vocabulary (5 -> 6 -> 7), NGSL-leveled allow-list
data/wordlists/ngsl-1.2.csv    # vendored NGSL 1.2 (CC BY-SA 4.0), see LICENSE-NGSL.txt
```

Run the full acceptance check:

```
npm install
npm run validate   # schema + referential + vocab-chain validation, exits non-zero on error
npm test           # vitest unit suite
npm run build       # tsc --noEmit
```

## Derive-then-review workflow

Every artifact here (curriculum bands, module clusters, vocabulary) is **derived** by an
AI-assisted skill under `.claude/skills/`, then **human-reviewed** before it's treated as
canonical:

1. **Curriculum extraction** (`curriculum-decompose` skill) — two-stage: a deterministic
   table→rows mapper (`src/extract/tableMapper.ts`), then AI-assisted semantic decomposition
   into typed entries. IDs freeze only after human review; see
   `docs/extraction-workflow.md` for the checklist and the draft-to-diff rule (a re-run never
   silently overwrites a committed file — it emits `*.draft.yaml` to diff against).
2. **Module derivation** (`module-derive` skill) — clusters curriculum entries into draft
   modules; for the 5/6 band, also allocates each item to grade 5 or grade 6 (teacher-refined
   draft, rationale in `docs/module-derivation-notes.md`).
3. **Vocabulary generation** (`vocab-generate` skill) — chain-ordered: grade 5 must be frozen
   before grade 6 generates (excluding grade 5's words), grade 6 before grade 7. Every
   proposed word is screened against the NGSL frequency list (`src/vocab/leveling.ts`); words
   absent from NGSL route to CEFR-fallback + teacher review, never an automatic reject.

`npm run validate` is the final gate: schema conformance, referential closure
(`covers`/`assesses`/`generated_from.curriculum` all resolve), and vocab chain integrity
(acyclic, no re-introduction, monotonic) across every committed file.

## Scope

In scope: grades 5, 6 (combined 5/6 band) and grade 7 (Realschule track only). Hauptschule
and grades 8-10 are out of scope for now — the file layout is additive, so extending later
doesn't require reshaping what's here.
