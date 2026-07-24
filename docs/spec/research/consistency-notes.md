# Inline consistency-pass findings (pre-CE-review)

Drift caught reading all 6 spec docs end-to-end (2026-07-24). Not yet applied — fold
into the post-review fix pass.

## Contradictions (high)
1. **01 §3.4 / §3.6 / §3.5 out of order.** Physical order is 3.4, 3.6 (vocabulary),
   3.5 (artifact registry), 3.7. Fix: move §3.5 Artifact registry *above* §3.6 (keep the
   number 3.5) — many files reference §3.6/§3.6a for vocabulary, so vocab must stay 3.6.
2. **03 §4.1 web tool stale.** Says "small single-page app (plain TS or a light
   framework)… thin local server" — contradicts resolved no-SPA / static-generated /
   TS decisions (§4.7, decisions log). Rewrite §4.1 as static-generated read-only index.
3. **04 §5.7 first bullet** still says "EVALUATE lehrplan-ontologie as the source for
   Component A / align IDs to its IRIs" — contradicts the decision NOT to use it as source
   (BFO overhead; decisions log + §3.1 + §5.7 deep-dive). Fix to comparison-only.
4. **04 §5.5 "Assessment depth … only schedules assessments"** — contradicts §5.6, which
   fully specs Erwartungshorizont + Notenschlüssel. Mark resolved → §5.6.
5. **04 §5.5 "Differentiation not yet decided"** — now effectively confirmed first-class
   (Erlass §7.1–7.2 Nachteilsausgleich + k12 pattern). Update to decided.

## Medium
6. 03 §4.2 line ~52: "safe to publish (§4.6)" should reference **§4.7** (hosting).
7. 03 §4.3 catalog: add `mcq`/question-set and `error_correction` rows (align with §06
   first-build set); change "grade 7/8 curriculum" → "grades 5–7".
8. 03 §4.4 "framework-free" vs §06 "compiled component framework (Lit/Svelte)":
   reconcile — output has no *runtime* framework dependency but may be *authored* in a
   compiled framework that bundles to one self-contained file.
9. 04 §5.3 items: mark **#7 (calendar UI)** resolved (hand-rolled grid, no lib) and
   **#8 (prior art)** resolved (→ §5.7). #2, #3, #3b remain low-priority open.
10. 01 §3.6 title "…+ textbook pointer" → "textbook references" (pointer is stale wording).

## Low
- 00 status line "First spec for review before the research pass" — stale; update.
- 04 Phase 1 "one module sequence for grade 7" — pilot is likely grade 5; leave as example.
- 04 §5.3 item 9 "operator list" — rsa doc already found no discrete operator list exists
  (AFB framework is the tagging structure); soften item 9 wording.
