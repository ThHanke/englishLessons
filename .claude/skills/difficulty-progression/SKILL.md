---
name: difficulty-progression
description: Sequence exercises within a set from near-transfer to far-transfer using 3 difficulty bands (supported → guided → independent). Integrates with eal-scaffold for scaffold fading.
---

# Exercise difficulty progression

Sequences exercises within a set so difficulty increases from near-transfer (close to worked examples) to far-transfer (novel application). Based on Sweller's cognitive load theory and desirable difficulties research.

## Inputs

- Exercise type (from `suggested_exercise_types` in lesson-spec)
- Target competences (from `focus_competences`)
- CEFR level (from dateContext)

## The 3 difficulty bands

| Band | Label | Cognitive demand | Scaffold level | Transfer distance |
|------|-------|-----------------|----------------|-------------------|
| 1 | **Supported** | Recognition / reproduction | Maximum (full word bank, sentence frames, model answer visible) | Near — mirrors the worked example closely |
| 2 | **Guided** | Application / reorganization | Partial (reduced word bank, sentence starters only, structure hint) | Medium — same skill, different context |
| 3 | **Independent** | Analysis / creation | Minimal (technical terms only, no frames) | Far — novel context, requires transfer |

## Procedure

### 1. Define the worked example

Before creating exercises, establish what students have seen:
- What model/example was presented in the lesson input phase?
- What grammar pattern, vocabulary set, or text structure was demonstrated?

Band 1 exercises stay close to this model.

### 2. Design Band 1 — Supported (2-3 items)

- Task mirrors the worked example with minor surface changes
- Full scaffolding from `eal-scaffold` (word banks, sentence frames, German cognate hints)
- Low risk of failure — builds confidence and schema
- Example: gap-fill where all words are provided, sentence reordering with a model to follow

### 3. Design Band 2 — Guided (2-3 items)

- Same skill/pattern but in a different context or with a twist
- Scaffolds partially removed: word bank reduced, sentence starters replace full frames
- Requires application of the rule/pattern, not just copying
- Example: gap-fill with partial word bank, transform sentences without a model

### 4. Design Band 3 — Independent (1-2 items)

- Novel context requiring genuine transfer
- Minimal scaffolding: only technical vocabulary support
- Students must recall and apply the pattern independently
- Example: free production (write your own sentences using the pattern), error correction without hints

### 5. Check for expertise reversal

For students already at B1 or in the `revision` phase:
- Band 1 may be unnecessary (over-scaffolding causes boredom and disengagement)
- Start at Band 2, or compress Band 1 to one quick item
- A teacher note: "Skip Band 1 if students demonstrated mastery in the warm-up"

### 6. Annotate each exercise

Label each exercise with:
- Band number (1/2/3)
- What changed from the previous band (scaffold removed, context shifted, demand increased)
- Which `eal-scaffold` supports apply at this band

## What changes between bands

| Dimension | Band 1 → 2 | Band 2 → 3 |
|-----------|------------|------------|
| Word bank | Full → partial (unfamiliar words only) | Partial → none |
| Sentence frames | Complete frame → opening phrase | Opening phrase → none |
| Context | Same as model → related topic | Related → novel |
| Response type | Select/complete → guided produce | Guided produce → free produce |
| German support | L1 translations → cognate hints | Cognate hints → English-only |
| Error tolerance | Correct form given → partial model | No model → self-monitor |

## Output

- Exercise set with items clearly labeled by band (1/2/3)
- Teacher note on which bands to use (all 3 for mixed-ability, skip Band 1 for advanced)
- Cross-reference to `eal-scaffold` supports per band
