---
name: eal-scaffold
description: Scaffold any exercise for German L1 / English L2 learners while preserving cognitive demand. Cross-cutting — applies to ALL exercise types. Invoke BEFORE generating exercise content.
---

# EAL task scaffolding (German L1 → English L2)

Guides scaffolding decisions for every exercise the companion agent creates. The goal is to reduce language barriers WITHOUT reducing cognitive demand (Gibbons: modify the route, not the destination; Tomlinson: differentiate process, not outcome).

## Inputs

- Exercise content or task description
- Target CEFR level (from dateContext: A1 for grade 5, A2 for grade 6-7, B1 for grade 8)
- `vocabulary/<grade>.yaml` — cumulative known word list

## Procedure

### 1. Identify language barriers

Read the exercise prompt and target competences. For each, ask:
- What vocabulary might block access? Check against `vocabulary/<grade>.yaml`.
- What sentence structures exceed the CEFR level?
- What cultural references need bridging for German students?

### 2. Select scaffolds by CEFR level

| CEFR | Word bank | Sentence starters | German hints | Visual support | Model answer |
|------|-----------|-------------------|--------------|----------------|--------------|
| A1 | Full (all key words) | Complete frames with one blank | L1 translation of instructions + key terms | Always | Full worked example |
| A2 | Partial (unfamiliar words only) | Opening phrases | Cognate hints only | When task is abstract | Partial model (first item done) |
| B1 | Technical/academic terms only | Discourse markers | False friend warnings only | Rarely | Structure outline only |

### 3. Apply German-specific L1 transfer supports

**Cognate leveraging** — highlight English words with transparent German cognates to build confidence:
- `garden/Garten`, `house/Haus`, `finger/Finger`, `winter/Winter`
- Mark these in word banks with (cf. German: ...) to activate transfer

**False friend warnings** — flag deceptive cognates that cause errors:
- `become` ≠ `bekommen` (= to get/receive)
- `gift` ≠ `Gift` (= poison)
- `brave` ≠ `brav` (= well-behaved)
- `chef` ≠ `Chef` (= boss)
- `handy` ≠ `Handy` (= mobile phone)
- `billion` ≠ `Billion` (= trillion)
- `sensible` ≠ `sensibel` (= sensitive)
- `sympathetic` ≠ `sympathisch` (= likeable)
- `fabric` ≠ `Fabrik` (= factory)
- `actual` ≠ `aktuell` (= current)

Include a false friend warning box when the exercise uses any of these.

**L1 transfer patterns by CEFR level:**

| Pattern | German habit | English target | CEFR |
|---------|-------------|----------------|------|
| V2 word order | Verb always second | SVO after adverbials too | A1+ |
| Capital nouns | All nouns capitalized | Only proper nouns | A1 |
| Compound words | Single compound (`Schultasche`) | Two words (`school bag`) | A1+ |
| Present perfect use | Perfekt for past narrative | Simple past for narrative, present perfect for result | A2+ |
| Preposition mismatch | `auf Deutsch` | `in English` (not `on English`) | A1+ |
| Article gender transfer | der/die/das → he/she/it for objects | `it` for all objects | A1 |
| Modal + infinitive position | Modal…infinitive at end | Modal + bare infinitive adjacent | A2+ |

### 4. Verify cognitive demand preserved

After adding scaffolds, check:
- Does the task still require the SAME thinking? (Identifying, analyzing, creating, evaluating)
- Have scaffolds removed the challenge, or only the language barrier?
- Would a native English speaker at the same cognitive level still find the task meaningful?

If scaffolds have lowered the cognitive demand, remove the excess. Scaffolds support language access, not task avoidance.

### 5. Plan scaffold removal

For any scaffold applied, note when to fade it:
- Word banks → reduce to first-letter hints → remove entirely
- Sentence starters → provide only discourse markers → remove
- German translations → replace with English paraphrases → remove
- Model answers → provide structure only → remove

This connects to `difficulty-progression`: band 1 (supported) uses maximum scaffolds, band 3 (independent) uses minimal.

## Output guidance

When creating exercises, include:
1. Which scaffolds were applied and why
2. The scaffold removal plan (for the teacher's reference)
3. Any false friend warnings relevant to this exercise's vocabulary
