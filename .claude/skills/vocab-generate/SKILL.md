---
name: vocab-generate
description: Agent-generate a grade's per-module controlled vocabulary by role assignment, chain-ordered across grades 5 -> 6 -> 7 so each grade excludes its predecessors' frozen cumulative set (KTD8), then validate with the required NGSL leveling check before it becomes the hard allow-list. Use only after the target grade's predecessor vocabulary file is frozen.
---

# Vocabulary generation (chain-ordered, per-grade)

No manual authoring, no prior knowledge required (§3.6a). The lexis a pupil has met by the
end of each module is fully determined by that module's curriculum categories (content
fields + grammar progression + text types), read from the frozen `plans/<grade>/modules.yaml`
and its referenced curriculum band.

## Hard ordering rule (KTD8)

Generation is **strictly chain-ordered**: grade 5 (no inheritance) is generated and frozen
first; grade 6 generates with grade 5's full frozen cumulative set supplied as "already
known — do not repeat"; grade 7 generates with grades 5+6's combined set. **Never generate a
successor grade before its predecessor is frozen** — the exclusion set would be unstable.

## Procedure per grade

1. Load `plans/<grade>/modules.yaml` (frozen or in-review draft) and the curriculum band it
   references.
2. If `inherits_from` is set, load the predecessor's **committed** `vocabulary/<predecessor>.yaml`
   and compute its full cumulative word set (union of all its module lists + `overrides.add`,
   minus `overrides.remove`) — this is the exclusion set.
3. For each module in teaching order, role-assign: "you are a Sachsen-Anhalt grade-N English
   teacher; list the productive + receptive lexis a pupil has met by the end of this module,
   given its content fields, grammar, and text types" — excluding anything already in the
   predecessor's cumulative set or already listed by an earlier module in this same grade
   (single canonical introduction, R8).
4. Run `src/vocab/leveling.ts` (`loadNgslSet` + `levelWordList`) against every proposed word.
   `accepted` words need no action; `flagged` words (not in NGSL — expected for proper nouns
   and topic-specific lexis) route to teacher review before acceptance, never an automatic
   reject (KTD6).
5. Write `vocabulary/<grade>.draft.yaml` (never overwrite a committed file directly — KTD3).
   Fields: `class` (matches `plans/<grade>/class.yaml`'s `name`), `inherits_from` (predecessor
   grade label, e.g. `grade-5`, or `null` for the first grade in the chain), `cumulative:
   true`, `generated_from: { curriculum, method: agent-role-assignment }`,
   `required_leveling: { frequency_list: ngsl-1.2 }`, `modules:` (new-at-this-grade lexis
   only, per module id), `taught_through` (see note below), `overrides` (optional).
6. Run `src/validate/referentialValidator.ts`'s `validateVocabChain` across every vocab file
   generated so far (this grade + its full ancestor chain) — must be acyclic, disjoint from
   ancestors (no re-introduction), and monotonic (no `overrides.remove` un-knowing an
   inherited word).
7. Human reviews the leveling flags and the chain validation result, resolves them (accept via
   CEFR-fallback judgment, or trim the list), then the reviewer accepts the draft — copy over
   the canonical path, delete the `.draft.yaml`. Only then may the next grade in the chain
   generate.

**`taught_through` initial value**: Phase 0 sets it to the grade's **last** module (not
DRAFT — KTD7 lists `taught_through` as populated now, unlike the time/calendar fields), so
the full drafted list is immediately reviewable and resolvable by downstream tooling. The
teacher resets it to reflect real classroom progress once the school year starts; it is not
a placeholder sentinel like `weeks`.

## Multi-word phrases

Collocations like "free time" are screened by NGSL against the phrase's head word (last
token), per `src/vocab/leveling.ts`'s documented rule — see that file's docstring, not
duplicated here.
