---
name: assessment-design
description: Design tests/quizzes using blueprint-before-items methodology. Builds a competence × depth matrix from milestone assesses[], confirms blueprint with teacher before generating items, tags items with competence IDs, solves for answer key fresh, marks uncertain items [VERIFY].
---

# Assessment blueprint and item design

Designs tests and quizzes aligned to competences and milestones using a blueprint-first methodology (adapted from YujxZJCN assessment-architect, MIT). The core principle: confirm the STRUCTURE of the test before writing any items. This prevents coverage gaps and over-testing of easy competences.

## Inputs

- `milestone_context` from lesson-spec: `{ next, in_slots, assesses[] }`
- `focus_competences` from lesson-spec
- CEFR level (from dateContext)
- `plans/<grade>/modules.yaml` — module goals for alignment check

## Procedure

### Step 1: Build the competence × depth matrix

From `milestone_context.assesses[]`, create a grid:

```
                    | Understand | Produce |
--------------------|-----------|---------|
[competence-id-1]   |     2     |    1    |
[competence-id-2]   |     1     |    2    |
[grammar-item-1]    |     1     |    1    |
...
```

Each cell = number of test items targeting that intersection.

**Depth allocation rules:**
- Every competence in `assesses[]` gets at least one item
- `produce` mode competences get more production items than recognition items
- `understand` mode competences get only recognition/comprehension items
- Grammar items get both understand (identify/explain) and produce (use correctly) items
- Total items: 15-25 for a 45-min test, 8-12 for a quiz

**Item type mapping:**
| Depth | Suitable exercise types |
|-------|------------------------|
| Understand (recognition) | `mcq`, `matching`, `tense_id`, `error_correction` (find only) |
| Understand (comprehension) | `reading_comprehension`, `listening_comprehension` |
| Produce (guided) | `gap_fill`, `transform`, `error_correction` (find + correct) |
| Produce (free) | `writing_prompt`, `dialogue`, `mediation` |

### Step 2: Present blueprint for teacher confirmation

**STOP HERE.** Present the matrix and item allocation to the teacher. Ask:
- "Does this blueprint cover what you want to assess?"
- "Should any competence get more/fewer items?"
- "Is the balance of understand vs produce appropriate?"
- "Any competences to add or remove?"

**Do not generate items until the teacher confirms the blueprint.**

### Step 3: Generate items per blueprint cell

For each cell in the confirmed matrix:
- Write items of the mapped exercise type
- Tag each item: `[competence-id] [depth: understand|produce]`
- Keep instructions concise: ≤3 sentences per instruction block (density rule from Anthropic k12)
- Items must be concrete and unambiguously answerable
- Vocabulary within `vocabulary/<grade>.yaml` — test the competence, not unknown words

**Item quality checklist:**
- [ ] Tests the target competence, not general English
- [ ] Has exactly one correct answer (or clearly defined acceptable range for production)
- [ ] Age-appropriate content and context
- [ ] No cultural bias beyond the Sachsen-Anhalt curriculum context
- [ ] Free from grammar/spelling errors in the prompt itself

### Step 4: Produce answer key by solving fresh

Solve every item as if seeing it for the first time. Do NOT copy your intended answer from when you wrote the item — solve it fresh to catch:
- Ambiguous items with multiple valid answers
- Items where the "correct" answer isn't actually the only correct option
- Calculation or logic errors in your own items

For production items (writing, dialogue): provide a model answer AND the minimum acceptable criteria.

### Step 5: Mark uncertain items

If any item has:
- Potentially ambiguous wording
- Multiple defensible correct answers
- A correct answer you're not 100% confident about
- Cultural assumptions that might not hold

Mark it with `[VERIFY]` and explain the uncertainty. The teacher reviews these before using the test.

### Step 6: Final structure

Organize the test/quiz:

```
Test structure:
  Header: class, date, module, "I can..." statements from assessed competences
  Section A: Reception (understand items) — easier → harder
  Section B: Production (produce items) — guided → free
  Total time: [X] minutes
  Total points: [X] (each item shows its point value)
```

Apply `difficulty-progression` within each section: easier items first, harder items last.

## Output

- Competence × depth blueprint matrix (for teacher confirmation)
- Test/quiz items (after confirmation), each tagged with competence ID and depth
- Answer key (solved fresh, not from intent)
- `[VERIFY]` markers on uncertain items with explanations
- Scoring rubric: points per item, total points, grade boundaries (if requested)
