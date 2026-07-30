---
name: grammar-intro
description: Design a plain-language grammar explanation (rule + before/after examples) for a lesson stage that introduces or recaps a grammar point. Feeds save_grammar_intro. Flags German L1 transfer risk so the explanation preempts the error, not just states the rule.
---

# Grammar introduction / recap design

Produces the content for a `grammar_intro` material — the structured counterpart to
`vocab-teaching`'s glossary, but for a grammar rule instead of vocabulary. Without this, a
lesson's actual grammar focus (e.g. passive voice) has nowhere to live except as an aside buried
in a stage's procedure text ("Mini board note: passive = be + past participle"), invisible on the
rendered lesson page and never seen by the pupil directly.

## When to use

Any stage whose procedure introduces a new grammar point for the first time, or explicitly
recaps one taught earlier. Not every grammar mention needs this — a stage that just *uses*
already-secure grammar in passing doesn't need a fresh explanation block. Use it when the stage
is the point where pupils are meant to understand the rule, not just apply it.

## Inputs

- The lesson's `focus_competences` grammar item (from lesson-spec)
- CEFR level (from dateContext) — controls how much metalanguage is acceptable
- `error-correction-design`'s German→English error catalog, if this grammar point appears there —
  check it first; a transfer error the catalog already documents is exactly what the explanation
  should preempt

## Procedure

### 1. State the rule in plain language

One or two sentences, no unexplained grammar jargon. If a technical term is unavoidable (e.g.
"past participle"), either avoid it or define it inline on first use — never assume the term is
already understood. Bad: "Form the passive with be + past participle." Better: "Passive sentences
put the thing the action happens to first, then a form of 'be' plus the -ed/-en form of the verb
(the same form used in 'has cleaned')."

### 2. Check for German L1 transfer risk

Before writing examples, ask: does German form this differently in a way that causes a
predictable error? Two cases:

- **Parallel structure (low risk, can reassure).** Some points map closely onto German and are
  easier to acquire — say so explicitly, it lowers pupil anxiety. Example: German's
  *Vorgangspassiv* ("wird gereinigt") is structurally close to English "is cleaned" — both are
  [helping verb] + [past participle]. The main difference is the helping verb itself (German
  *werden*, English *be*) and that German marks aspect/state distinctions (*Vorgangs-* vs.
  *Zustandspassiv*) English doesn't.
- **Divergent structure (transfer risk, needs explicit contrast).** Cross-reference
  `error-correction-design`'s catalog. If the point matches a documented transfer error (word
  order, tense/aspect, prepositions, false friends, article/pronoun), name the German source
  pattern and contrast it directly in the explanation, the way that skill's answer keys do.

### 3. Write before/after examples

2-4 examples, each pairing the source form with the target form so the transformation is visible,
not just asserted:
- `before`: the form pupils already know (e.g. the active sentence), optional — omit for a
  recap of something with no natural "before" form
- `after`: the target form, always present

Keep every example within the grade's known vocabulary (`vocabulary/<grade>.yaml`) — a grammar
example is not the place to also introduce new words.

### 4. Decide `mode`

- `introduce` — genuinely new grammar point for this class. Ledger depth `introduced`.
- `recap` — pupils already met this point in an earlier lesson; this stage is reinforcing it, not
  teaching it for the first time. Ledger depth `practiced`.

## Output

Call `save_grammar_intro` with:
- `title`: descriptive title (e.g. "Passive Voice — be + past participle")
- `mode`: `introduce` or `recap`
- `explanation`: the plain-language rule from step 1 (fold in the L1 contrast note from step 2
  where relevant)
- `examples`: the before/after pairs from step 3

Reference the returned filename in the stage's `materialRefs` so the lesson page embeds the
explanation directly under the stage that teaches it, instead of leaving it as unrendered
procedure prose.
