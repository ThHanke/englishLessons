---
name: error-correction-design
description: Design error correction exercises with realistic German→English transfer errors. One deliberate error per sentence, scaffolded analysis (find → explain → correct), with a German-specific error catalog.
---

# Error correction exercise design

Creates error correction exercises using deliberate, realistic errors that target specific misconceptions common to German L1 learners. Research on erroneous examples shows delayed but superior retention when errors are realistic and commonly occurring (not random or bizarre).

## Inputs

- Target grammar competences from lesson-spec `focus_competences`
- CEFR level (from dateContext)
- `vocabulary/<grade>.yaml` — to keep sentences within known vocabulary

## German→English error catalog

Use these L1 transfer error patterns when designing sentences. Each represents a real, frequent error type:

### Word order errors
| Error type | Example (with error) | Correct | German source pattern |
|------------|---------------------|---------|----------------------|
| V2 after adverbial | *Yesterday went I to school.* | Yesterday I went to school. | Gestern ging ich zur Schule. |
| V2 after connective | *Then have we played football.* | Then we played football. | Dann haben wir Fußball gespielt. |
| Verb-final in subordinate | *I know that he in Berlin lives.* | I know that he lives in Berlin. | Ich weiß, dass er in Berlin wohnt. |
| Adjective after noun | *The car red is fast.* | The red car is fast. | Das Auto rote ist schnell. (hypercorrection from French-style transfer) |

### Tense/aspect errors
| Error type | Example (with error) | Correct | German source pattern |
|------------|---------------------|---------|----------------------|
| Perfekt → present perfect for narrative | *Yesterday I have gone to the cinema.* | Yesterday I went to the cinema. | Gestern bin ich ins Kino gegangen. |
| No progressive aspect | *Look! It rains.* | Look! It is raining. | Schau! Es regnet. (no progressive in German) |
| Since + simple past | *I live here since 2020.* | I have lived here since 2020. | Ich lebe hier seit 2020. (present tense in German) |

### Preposition errors
| Error type | Example (with error) | Correct | German source pattern |
|------------|---------------------|---------|----------------------|
| in/on confusion | *I do this on the weekend.* (acceptable in AmE) / *He is good in maths.* | He is good at maths. | Er ist gut in Mathe. |
| to/in confusion | *I go in the cinema.* | I go to the cinema. | Ich gehe ins Kino. |
| Literal translation | *I wait on the bus.* | I wait for the bus. | Ich warte auf den Bus. |

### False friend errors
| Error type | Example (with error) | Correct | False friend |
|------------|---------------------|---------|--------------|
| become/bekommen | *Can I become a coffee?* | Can I get/have a coffee? | bekommen = to get |
| gift/Gift | *The gift was dangerous.* (ambiguous) | Design sentences where the false friend is clearly wrong in context | Gift = poison |
| actual/aktuell | *The actual news is about football.* | The current news is about football. | aktuell = current |

### Article/pronoun errors
| Error type | Example (with error) | Correct | German source pattern |
|------------|---------------------|---------|----------------------|
| Gender transfer | *The sun, she is bright today.* | The sun is bright today. (or: It is bright.) | Die Sonne, sie scheint. |
| Missing "it" (weather) | *Today is cold.* | Today it is cold. / It is cold today. | Heute ist kalt. |

## Procedure

### 1. Select 3-5 error types for the target competences

Match error types from the catalog to the lesson's `focus_competences`. If the focus is on present perfect, use tense/aspect errors. If on prepositions, use preposition transfer errors.

### 2. Write sentences with ONE error each

Rules:
- Exactly one error per sentence (multiple errors overwhelm and confuse)
- Sentence vocabulary within the grade's known vocab (`vocabulary/<grade>.yaml`)
- Error must be a realistic German L1 transfer error, not a random mistake
- Context should make the error recognizable (not ambiguous whether it's wrong)
- Sentences should be meaningful and age-appropriate

### 3. Create scaffolded analysis prompts

Three-step scaffold for each sentence:

| Step | Prompt | Develops |
|------|--------|----------|
| **Find** | "Underline the mistake in the sentence." | Error detection |
| **Explain** | "Why is this wrong? What rule does it break?" | Metalinguistic awareness |
| **Correct** | "Write the correct sentence." | Production |

For A1 learners: provide the error type as a hint ("This sentence has a word order mistake").
For A2+: no hints — students identify the error type themselves.

### 4. Write the teacher answer key

For each sentence:
- The error, highlighted
- The correct version
- The German L1 source pattern that causes this error (so the teacher can explain WHY students make this mistake)
- A brief teaching point

### 5. Include a prevention tip

After the exercise, include one transferable rule students can remember:
- e.g., "In English, the subject almost always comes before the verb — even after time words like 'yesterday' or 'then'."

## Output

- 5-8 error correction sentences (one error each)
- Scaffolded student worksheet (find → explain → correct)
- Teacher answer key with L1 transfer explanations
- Prevention tip for the target error pattern
