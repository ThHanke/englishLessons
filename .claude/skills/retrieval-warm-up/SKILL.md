---
name: retrieval-warm-up
description: Design a structured 5-8 minute warm-up with retrieval practice targeting prior coverage. Uses prior_covered from dateContext. Calibrates recall type to time-since-learning.
---

# Structured retrieval warm-up design

Designs the retrieval practice portion of a lesson opening (Rosenshine's daily review principle). The testing effect research shows retrieval practice is more effective than re-study — but only when calibrated to difficulty.

## Inputs

- `prior_covered` competences from dateContext (what students have already learned)
- `gaps` from dateContext (competences needing more depth — prioritize these)
- `weekInModule` from dateContext (how far into the current module)
- `phase` from dateContext (`new_input`, `practice`, `revision`)
- `plans/<grade>/modules.yaml` — module goals and covers[]

## Procedure

### 1. Select 3-5 retrieval items

Draw from `prior_covered` and `gaps`. Prioritize:
1. Competences flagged as needing "more depth" in gaps
2. Competences covered 1-2 lessons ago (consolidation window)
3. One item from 2+ weeks ago (spaced practice — retrieval at increasing intervals)

Mix grammar, vocabulary, and skills — not all from one area.

### 2. Calibrate recall type to recency

| Time since learning | Recall type | Format examples |
|---------------------|-------------|-----------------|
| Last lesson (1-3 days) | Free recall | "Write 3 sentences using [grammar point]"; "List words from last lesson's topic" |
| 1-2 weeks ago | Cued recall | Gap-fill with first letter; sentence completion; "What's the rule for...?" |
| 2+ weeks ago | Recognition | Multiple choice; true/false; match term to definition; error spotting |

Newer material gets harder retrieval (free recall) because it's fresher. Older material gets easier retrieval (recognition) to prevent failure discouragement while still activating the memory.

### 3. Structure the activity (5-8 minutes)

```
Warm-up structure:
  1. Quick fire (2 min) — 3-4 recognition items, whole class, oral or show-of-hands
  2. Think-write (2-3 min) — 1-2 cued/free recall items, individual written response
  3. Check (1-2 min) — partner swap and check, or teacher reveals answers
```

Total: 5-7 minutes. Add 1 minute buffer for transitions.

### 4. Write answer key

Provide complete answers for all items so the teacher can run the check phase quickly.

### 5. Phase adjustments

| Phase | Warm-up emphasis |
|-------|-----------------|
| `new_input` | Lighter retrieval (3-4 items). Focus on prerequisite knowledge for today's new content. |
| `practice` | Standard retrieval (4-5 items). Mix recent and older material. |
| `revision` | Heavier retrieval (5-6 items). Diagnostic — identify what needs re-teaching before the milestone. |

## Output

- Timed warm-up activity (5-8 min) with clear teacher instructions
- Each item labeled with: target competence, recall type, time-since-learning estimate
- Complete answer key
- Note which gaps this warm-up addresses
