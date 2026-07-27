---
name: lesson-opening
description: Design an evidence-based 8-12 minute lesson opening with 3 parts — retrieval starter (invokes retrieval-warm-up), prior knowledge bridge, and "I can..." learning intention. Phase-aware.
---

# Evidence-based lesson opening design

Designs the first 8-12 minutes of a lesson with three structured components (Rosenshine's daily review + Ausubel's advance organizers). This is the frame that wraps the retrieval warm-up into a complete opening sequence.

## Inputs

- Today's topic and target competences (from lesson-spec `focus_competences`)
- Previous learning (from `prior_covered` in dateContext)
- Phase (from dateContext: `new_input`, `practice`, `revision`)
- Module goals (from dateContext `moduleGoals`)
- Week in module (from dateContext `weekInModule`)

## The 3-part opening

### Part 1: Retrieval starter (5-6 minutes)

**Invoke the `retrieval-warm-up` skill** to design this component.

The retrieval starter activates prior knowledge through structured recall. It is the most time-intensive part of the opening because retrieval practice has the highest effect size for long-term retention.

### Part 2: Prior knowledge bridge (2-3 minutes)

Connect what students already know (retrieved in Part 1) to what they will learn today. This is Ausubel's advance organizer: "The most important single factor influencing learning is what the learner already knows."

**Bridge techniques by phase:**

| Phase | Bridge type | Example |
|-------|------------|---------|
| `new_input` | **Conceptual bridge** — connect new concept to a known one | "Last week you learned the simple past for stories about the past. Today we'll learn the present perfect — for when the past connects to NOW." |
| `practice` | **Skill bridge** — connect today's practice to the pattern taught in new_input | "You've seen how to form the present perfect. Today you'll practice using it to talk about your own experiences." |
| `revision` | **Diagnostic bridge** — identify what needs consolidation before the milestone | "Before the test next week, let's check what you're confident about and what needs more practice." |

The bridge should be:
- 2-3 sentences, spoken by the teacher
- Explicitly names the connection: "Last time... → Today..."
- Uses student-friendly language, not curriculum jargon

### Part 3: Learning intention — "I can..." statement (1 minute)

State what students will be able to do by the end of the lesson, using a student-facing "I can..." format.

**Rules for "I can..." statements:**
- Observable and concrete: "I can write 3 sentences in the present perfect" not "I understand the present perfect"
- Achievable in one 45-minute lesson
- Aligned with the focus competences
- Written on the board (or displayed) — students should see it throughout the lesson
- At CEFR-appropriate complexity

**Examples by CEFR level:**
| CEFR | Example |
|------|---------|
| A1 | "I can say what I like and don't like using 'I like...' and 'I don't like...'." |
| A2 | "I can write a short email to a friend about what I did at the weekend, using the simple past." |
| B1 | "I can express and justify my opinion about a topic, using linking words like 'however', 'although', and 'on the other hand'." |

## Phase-specific opening adjustments

| Phase | Part 1 emphasis | Part 2 emphasis | Part 3 emphasis |
|-------|----------------|-----------------|-----------------|
| `new_input` | Lighter retrieval (prerequisite activation) | Strong advance organizer (what's coming and why) | Clear, specific "I can..." for the new skill |
| `practice` | Standard retrieval (mix recent + older) | Brief bridge linking input to practice | "I can..." focuses on application |
| `revision` | Heavy diagnostic retrieval (identify weak spots) | Honest bridge: "Here's what the test will cover" | "I can..." references the milestone competences |

## Timing template

```
[0:00-0:05/06]  Part 1 — Retrieval starter (invoke retrieval-warm-up skill)
[0:05/06-0:08]  Part 2 — Prior knowledge bridge
[0:08-0:09]     Part 3 — "I can..." statement → write on board
[0:09-0:10]     Transition to main activity
```

Total: 8-10 minutes. Never exceed 12 minutes — the opening supports the lesson, it IS NOT the lesson.

## Output

- Complete 3-part opening script with timing
- Retrieval starter (from retrieval-warm-up skill)
- Bridge text (2-3 teacher sentences connecting old → new)
- "I can..." statement for the board
- Phase-specific notes
