---
name: vocab-teaching
description: Select vocabulary for explicit teaching using Beck's Tier 1/2/3 model adapted for German L1 learners. Tier 2 = explicit teaching priority. Checks cognates and false friends per word.
---

# Vocabulary selection and tiering for explicit instruction

Determines which vocabulary to explicitly teach vs assume known, using Beck/McKeown/Kucan's three-tier model adapted for German→English EAL context. The key insight: Tier 2 words (high-leverage academic vocabulary) give the most return on explicit teaching time.

## Inputs

- Lesson topic and target competences (from lesson-spec)
- `vocabulary/<grade>.yaml` — cumulative known vocabulary for this grade
- `plans/<grade>/modules.yaml` — module goals and content fields
- CEFR level (from dateContext)

## Beck's tiers adapted for German L1

| Tier | Definition | Teaching action | German L1 adaptation |
|------|-----------|-----------------|---------------------|
| **Tier 1** | High-frequency everyday words students likely know | Assume known; don't spend teaching time | Check against `vocabulary/<grade>.yaml`. If listed as known, skip. German cognates (Haus/house) are effectively Tier 1 even if not yet formally taught. |
| **Tier 2** | Academic, high-leverage words useful across contexts | **Explicit teaching priority** | This is where teaching time goes. Check for German cognates (easier acquisition) and false friends (need explicit warning). |
| **Tier 3** | Low-frequency technical/topic-specific words | Pre-teach only if needed for comprehension; don't drill | Provide quick German translation in parentheses; don't assess. |

## Procedure

### 1. Extract vocabulary from the lesson content

List all significant vocabulary items in today's lesson content, exercises, and texts. Include:
- Target vocabulary from the module's content field
- Grammar-related terms (e.g., irregular verb forms)
- Text-type vocabulary (e.g., letter-writing conventions)

### 2. Classify each word

For each word, determine:
- **Tier**: 1, 2, or 3 (using definitions above)
- **In vocabulary.yaml?**: yes/no — if yes, it's been formally introduced
- **German cognate?**: transparent cognate, false friend, or no cognate
- **Teaching priority**: skip (Tier 1, known), teach (Tier 2), pre-teach if needed (Tier 3)

### 3. Build Tier 2 word cards

For each Tier 2 word (the explicit teaching targets), provide:

```
Word: [word]
Definition: [student-friendly, in English]
In context: [example sentence from the lesson topic]
Word family: [noun/verb/adjective forms]
Collocations: [2-3 common word partnerships]
German connection: [cognate: ..., OR false friend: ... ≠ ..., OR no German cognate]
```

### 4. German-specific checks

**Cognate leveraging** — Tier 2 words with German cognates are easier to acquire. Flag these as "cognate advantage" and spend less time on them:
- `information/Information`, `temperature/Temperatur`, `comfortable/komfortabel`

**False friend alert** — Tier 2 words that are false friends need EXTRA time, not less:
- `eventually` ≠ `eventuell` (= possibly)
- `contest` ≠ `Kontest` (rare in German; use `Wettbewerb`)
- `novel` ≠ `Novelle` (= novella, a specific literary form)
- `to control` ≠ `kontrollieren` (= to check/inspect, not to have power over)
- `to realize` ≠ `realisieren` (= to implement, not to become aware)

Mark these: "**False friend — needs explicit teaching.** Students will guess wrong."

### 5. Design a quick-check activity

A 3-5 minute vocabulary check activity for the lesson (or as homework):
- Match word to definition (Tier 2 words)
- Use word in a sentence (Tier 2 words with cognate advantage — easier production)
- Spot the false friend (if any false friends appear in this lesson)

### 6. Cross-reference with vocabulary.yaml

After selecting teaching targets:
- Verify none of the Tier 2 words are already in `vocabulary/<grade>.yaml` as known — if they are, they're Tier 1 for this class
- Note any Tier 2 words that should be added to the module's vocabulary list after teaching

## Output

- Tiered vocabulary list: Tier 1 (skip), Tier 2 (teach), Tier 3 (pre-teach if needed)
- Word cards for all Tier 2 items
- False friend warnings where applicable
- Quick-check activity (3-5 min)
- Vocabulary.yaml update recommendations
