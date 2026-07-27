---
name: sentence-frames
description: Generate CEFR-graded sentence frames for productive tasks (dialogue, writing, mediation). A1 = full sentence + blank, A2 = sentence starter, B1 = discourse marker + open ending. Builds on eal-scaffold methodology.
---

# Sentence frame generation for productive skills

Generates proficiency-graded sentence frames that scaffold productive language tasks. Frames encode thinking structure, not just grammar — they help students organize ideas in English while building toward independent production (Gibbons' scaffolding, Zwiers' academic language functions).

## Inputs

- Task type: `dialogue`, `writing_prompt`, or `mediation`
- Target CEFR level (from dateContext)
- Target competences (from lesson-spec `focus_competences`)
- Topic/context of the task

## CEFR-graded frame types

### A1 — Full sentence with one blank

Students complete a nearly-finished sentence. The frame carries the grammar; students supply content.

```
Examples:
  "My favourite _______ is _______."
  "I like _______ because it is _______."
  "On Monday, I _______ to school."
  "Can I have _______, please?"
```

### A2 — Sentence starter

Students complete the second half. The frame provides the opening structure; students must construct the rest.

```
Examples:
  "I think that..."
  "In my opinion,..."
  "First, you need to..."
  "The difference between X and Y is..."
```

### B1 — Discourse marker + open ending

Students get a discourse connector that signals the function (contrast, addition, cause) but must construct the full clause.

```
Examples:
  "However,..."
  "Although X, ..."
  "As a result,..."
  "On the one hand, ... On the other hand,..."
  "While it is true that..., I would argue that..."
```

## Frames by task type

### Dialogue (`dialogue` exercise type)

Turn-taking frames that scaffold conversation structure:

| Function | A1 | A2 | B1 |
|----------|----|----|-----|
| Greeting | "Hello, my name is ___." | "Hi, I'm... Nice to meet you." | "Good morning. I was wondering if..." |
| Asking | "Do you like ___?" | "What do you think about...?" | "Could you tell me more about...?" |
| Agreeing | "Yes, I like ___ too." | "I agree because..." | "That's a good point. I'd also add that..." |
| Disagreeing | "No, I don't like ___." | "I don't think so because..." | "I see your point, but I think..." |
| Closing | "Goodbye!" | "It was nice talking to you." | "Thanks for the conversation. To sum up,..." |

### Writing prompt (`writing_prompt` exercise type)

Paragraph structure frames:

| Function | A1 | A2 | B1 |
|----------|----|----|-----|
| Topic sentence | "This text is about ___." | "I am going to write about..." | "The aim of this text is to..." |
| Adding detail | "___ is ___ and ___." | "Another important thing is..." | "Furthermore, ... Moreover,..." |
| Example | "For example, ___." | "For example, you can see this when..." | "This is illustrated by the fact that..." |
| Conclusion | "I like ___ very much." | "In conclusion, I think..." | "To sum up, ... All things considered,..." |

### Mediation (`mediation` exercise type)

Transfer frames with source/target language function:

| Function | A1 | A2 | B1 |
|----------|----|----|-----|
| Source summary | "The German text says that ___." | "The text is about... It explains that..." | "According to the text, the main point is that..." |
| Key info transfer | "The important information is: ___." | "The most important thing to know is..." | "The key finding/argument is that..." |
| Simplification | "This means: ___." | "In simple words, this means..." | "Put simply, what this implies is that..." |

## German-specific bridging

Frames address German sentence structure habits:

| German habit | Frame design |
|-------------|-------------|
| Verb-second in main clauses | English frames show SVO explicitly: "I [verb] [object]" not "[verb] I [object]" |
| Verb-final in subordinate clauses | Frames with "because/that/when" show verb placement: "I think that he **is** happy" |
| Compound word preference | Frames use multi-word English equivalents: "school bag" not compound |
| Formal/informal register blur | Dialogue frames distinguish "Can I...?" (informal) from "Could you...?" (formal) |

## Procedure

1. Identify the task type and CEFR level from the lesson context
2. Select frame category (dialogue/writing/mediation) and functions needed
3. Provide frames at the target CEFR level
4. Include one level below as support (for struggling students) and one level above as extension (for stronger students)
5. Add German bridging notes where sentence structure transfer is likely

## Progression plan

Frames are scaffolds — plan their removal:
- Lesson 1: Full frames provided on worksheet
- Lesson 2: Frames on the board (not on paper — students must look up)
- Lesson 3: Only discourse markers provided
- Lesson 4: Students produce from memory; frames available as a safety net only

## Output

- Sentence frames graded at target CEFR level (with ±1 level variants)
- Mapped to the specific task functions needed
- German bridging notes
- Progression/fading plan for the teacher
