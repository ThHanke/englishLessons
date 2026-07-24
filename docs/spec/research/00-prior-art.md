# Prior Art: Curriculum Planning, Lesson Generation, and Educational Technology

## Repository Summary Table

| Name | URL | Stars | Last Activity | What It Does | Key Findings |
|------|-----|-------|----------------|-------------|--------------|
| **anthropics/k12-teacher-skills** | https://github.com/anthropics/k12-teacher-skills | 140 | 2026 | Official Anthropic K-12 lesson planning & lesson differentiation skills | Standards-aligned lesson generation; accesses Learning Commons knowledge graph (50 US states); tier-based differentiation (below/at/above) |
| **GarethManning/education-agent-skills** | https://github.com/GarethManning/education-agent-skills | 459 | Active | 165 evidence-based pedagogical skills across 20 domains | Grounded in named research; covers memory science, curriculum design, AI literacy, inclusive design; YAML schema for programmatic access; MCP server available |
| **YujxZJCN/teaching-skills** | https://github.com/YujxZJCN/teaching-skills | 13 | Jun 2026 | Comprehensive teaching lifecycle suite for university professors | 15 skills across 6 stages (design→build→assess→deliver→reflect→support); backward design + constructive alignment; Socratic guidance; Course Passport YAML as single source of truth; deterministic gates |
| **DivanshiJain2005/AI-lesson-planner** | https://github.com/DivanshiJain2005/AI-lesson-planner | 4 | Active | AI lesson plan generator using RAG + OpenAI | Streamlit-based; generates structured plans with learning outcomes & assessments; JSON export |
| **asiln/Lesson-Plan-Generator** | https://github.com/asiln/Lesson-Plan-Generator | 6 | 2024 | GPT-3.5 lesson plan generator | Web interface with PDF export; used in UAE educational contexts |
| **FWU-DE/lehrplan-ontologie** | https://github.com/FWU-DE/lehrplan-ontologie | 5 | Feb 2026 | Machine-readable formal ontology for German school curricula | SPARQL queryable; supports primary & secondary education; cross-state comparison; ontology development kit-based |
| **joachimdieterich/curriculum** | https://github.com/joachimdieterich/curriculum | 3 | 2024 | German digital curriculum/competency certification platform | Topic-based learning objectives; visualization of achievement status (red/green); PDF certificate generation; LDAP integration; deprecated (migrate to Laravel version) |
| **PalmarHealer/wochenplan** | https://github.com/PalmarHealer/wochenplan | 2 | Jan 2025 | Web-based lesson organization & scheduling tool | Admin panel, sick leave tracking, PDF export; **archived—no longer maintained** |
| **mar-wir/lp21_parser** | https://github.com/mar-wir/lp21_parser | 1 | Active dev | Swiss Lehrplan 21 curriculum data crawler | Parses 3,000+ cross-referenced competencies; CSV export; addresses teacher coordination challenge for avoiding duplication |
| **educates/educates-course-design-skill** | https://github.com/educates/educates-course-design-skill | 1 | Active | Claude Code skill for Educates platform course planning | Flexible scope (single workshop → multi-part courses); bootstrap existing courses; consistency verification |
| **EduBase/MCP** | https://github.com/EduBase/MCP | 27 | Jul 2026 | MCP server for EduBase e-learning platform | Advanced quiz system (LaTeX, parametrization, cheating detection); unified learning environment; GDPR compliance; OAuth 2.1; multiple transport protocols |
| **Lumieducation/Lumi-AI-Editor** | https://github.com/Lumieducation/Lumi-AI-Editor | 0 | Active | AI-powered H5P interactive worksheet editor (React 19) | Drag-drop content blocks; AI chat assistant for contextual editing; H5P export; customizable system prompts; text-to-speech |
| **cassproject/CASS** | https://github.com/cassproject/CASS | 60 | Jul 2026 | Competency and Skills System platform | Framework authoring & individual competency tracking; xAPI/OpenBadges 2.0/IMS CASE adapters; Docker; Node.js REST API + Elasticsearch |
| **csv610/mcq_generator** | https://github.com/csv610/mcq_generator | 9 | Active | Multi-choice question generator using multiple LLM providers | LiteLLM-based (OpenAI, Claude, Perplexity); customizable difficulty/format; prerequisite knowledge & translation analysis |
| **zarazhangrui/codebase-to-course** | https://github.com/zarazhangrui/codebase-to-course | 5.3k | Active | Claude Code skill: convert codebase → interactive single-page HTML course | Scroll-based modules with progress; side-by-side code + plain-English translation; animated data flow; interactive quizzes; self-contained HTML |
| **rwilcox/school_days** | https://github.com/rwilcox/school_days | 13 | Mature | Ruby gem for school calendar calculations | Understands weekends, holidays, exceptions; one calendar only; check if date is school day/night; YAML configuration |
| **owbezick/Standards-Based-Gradebook** | https://github.com/owbezick/Standards-Based-Gradebook | 2 | Dec 2020 | Open-source standards-based grading application (R + RStudio) | Interactive grade management via RHandsonTable; multi-class support; dropdown grade selection; manual save |
| **fborchers/schule2e** | https://github.com/fborchers/schule2e | 0 | Active | LaTeX collection for German school exams & materials | Modular exam2e document class (adapted from Philip Hirschhorn's exam); mathe2e stylesheet; LGS converter for linear equation systems |
| **mck-sbs/Notenschlüssel** | https://github.com/mck-sbs/Notenschluessel | 0 | Mature | iOS app for German grade conversion (SwiftUI) | IHK (Bayern) & FS (Bayern) grading scales; native app |
| **geekquad/quiz.ai** | https://github.com/geekquad/quiz.ai | 30 | Active | Automatic MCQ generator from text/PDF (NLP) | Extracts concepts; generates questions with distractors; self-assessment & question paper generation; Flask + Firebase + HTML/CSS/JS |
| **open-education-hub/oer-template** | https://github.com/open-education-hub/oer-template | 3 | Active | Template for creating open educational resources (OER) | Docusaurus-based; chapters/ directory structure; Markdown slides via reveal-md; GitHub Pages deployment; automated workflow |
| **classroomio/classroomio** | https://github.com/classroomio/classroomio | 1.6k | Active | Open-source LMS for corporate training | AI course builder & in-lesson tutoring (Claude/GPT-4o/Gemini); compliance tracking; multi-org support; webhooks/REST API/MCP server; 10+ language support; SvelteKit + PostgreSQL |

---

## Synthesis: Gaps, Strengths, Weaknesses, and Novelty Assessment

### (A) Gaps & Ideas We Haven't Covered

1. **Bidirectional Coverage Ledger Not Found**  
   None of the projects implement a _persistent, bidirectional_ coverage tracking system (lessons report what they actually taught → automatic gap analysis → depth-aware risk flagging). CASS and xAPI exist for competency tracking, but not integrated with lesson generation + calendar projection.

2. **Calendar-Aware Curriculum Scheduling (Germany-Specific)**  
   - `school_days` (Ruby) does date arithmetic but **doesn't project curriculum forward** deterministically.  
   - No project combines: Bundesland Ferienkalender + Lehrplan graph + pre/post-holiday pace adjustments + "which module on date X" queries.  
   - German education ontology (FWU-DE) exists but isn't linked to calendar/scheduling.

3. **Static Site Delivery + Stable URLs**  
   Most platforms (LMS, Streamlit, Flask) generate content dynamically. None explicitly target "_offline-ready HTML worksheets built into a GitHub Pages static site_" per-date versioned.

4. **Grading Law Grounded Assessment (Germany)**  
   Anforderungsbereiche I/II/III + Notenschlüssel by Bundesland are rarely embedded into generation. Tools like `schule2e` (LaTeX) are structural; none generate test grading rubrics _automatically_ from state-law tables.

5. **Depth-Aware Curriculum Mapping**  
   CaSS and FWU-DE ontology exist but don't encode "introduced/practiced/assessed/produce" _progression_. No tool tracks _depth per topic per date_.

6. **Multi-Skill Orchestration with Fallback**  
   Teaching-skills (Yujx) does 15 skills in sequence; none orchestrate _per-exercise-type_ skill dispatch (gap-fill skill ≠ listening comprehension skill) with teacher-confirmed text references.

### (B) Where Our Approach Looks Stronger

1. **Deterministic Calendar Projection**  
   We: Given a start date, Lehrplan, and Ferienkalender, output "module X on 2026-09-15 + depth Y + prior coverage context."  
   Prior art: `school_days` does date math; `classroomio`, `k12-teacher-skills` do lesson planning but not calendar-aware scheduling.

2. **Competency Graph as Single Source of Truth**  
   We: Lehrplan parsed → competence ID graph → module derivation → lesson queries.  
   Prior art: FWU-DE ontology is formal but requires query expertise; CASS is competency-tracking but not curriculum-parsing.

3. **Bidirectional Coverage & Risk Flagging**  
   We: Lessons emit coverage → ledger → gap report → drives next lesson.  
   Prior art: CASS tracks attainment; no project does bidirectional lesson↔coverage feedback loop.

4. **Offline Static HTML + Git Versioning**  
   We: All worksheets are self-contained HTML, versioned per date in git, zero runtime dependencies.  
   Prior art: Lumi-AI-Editor exports H5P; `codebase-to-course` produces self-contained HTML; but neither is git-versioned per-date.

5. **Conversational, Citation-Aware Orchestration**  
   We: Teacher says "grade 7 tomorrow" → system recalls prior lessons + coverage + asks for textbook pages (citations only, never content).  
   Prior art: `teaching-skills` is thorough but doesn't ground in prior lesson context; `k12-teacher-skills` doesn't cite textbooks.

### (C) Where Our Approach Looks Weaker or Riskier

1. **No Pilot on Real Classroom Data**  
   Prior art (e.g., `classroomio`, `k12-teacher-skills`) have institutional backing (Anthropic, Learning Commons). We have a spec, no deployment.

2. **Lehrplan Parsing Assumes Well-Structured Input**  
   FWU-DE ontology is structured; we'll parse PDF/HTML curriculum documents. If Bundesland documents vary widely, parsing is fragile.

3. **Depth Encoding May Be Subjective**  
   We assign "introduced/practiced/assessed/produce" to competence IDs. Who verifies correctness? CASS/xAPI are agent-neutral; we're design-opinionated.

4. **No Integration with Existing Grade Platforms**  
   We target "stable URLs + static HTML." Real schools use Moodle, Magister, etc. Cross-system sync not addressed.

5. **Teacher UX Unproven**  
   "Conversational orchestrator that asks for citations" assumes teacher comfort with iterative refinement. User research needed.

### (D) Coverage-Ledger + Calendar-Projection Novelty: Confirm or Deny

**Deny full novelty; confirm unique combination:**

- **Coverage tracking** exists (CASS, xAPI, CaSS, `cassproject/CASS`).  
- **Calendar scheduling** exists (`school_days`, `calendar_generator`, `TeacherScheduler`).  
- **Curriculum mapping** exists (FWU-DE, CaSS, Curriculum mapping literature).  
- **Lesson generation** exists (k12-teacher-skills, teaching-skills, education-agent-skills).  

**But the _combination_—parsing a Lehrplan → competency graph → calendar-deterministic module scheduling → bidirectional coverage ledger → depth-aware gap reporting—is not found in any single project.**

Closest antecedent: `FWU-DE/lehrplan-ontologie` + `school_days` + CASS + `k12-teacher-skills`, glued together manually. No project integrates all four.

---

## Specific Learnings to Incorporate

1. **From `anthropics/k12-teacher-skills`:**  
   - Differentiation (below/at/above proficiency) is table-stakes.  
   - Learning Commons knowledge graph model is proven; consider similar for Lehrplan graph.

2. **From `GarethManning/education-agent-skills`:**  
   - Evidence-based skill library scales to 165+ prompts; YAML schema enables programmatic chaining.  
   - Use this pattern for exercise-type skills (gap-fill, listening, etc.).

3. **From `YujxZJCN/teaching-skills`:**  
   - Backward design → Assessment plan → Semester arc is a proven sequence.  
   - "Course Passport" (single YAML source of truth) is elegant; apply to per-module metadata.

4. **From `FWU-DE/lehrplan-ontologie`:**  
   - German curriculum formalization exists; reach out/reuse if compatible.  
   - SPARQL queryability for competency relationships is valuable.

5. **From `CASS` (cassproject):**  
   - xAPI + Open Badges protocols are standards-based fallback for integration.  
   - Protocol adapters pattern enables interop with other systems.

6. **From `Lumi-AI-Editor`:**  
   - Drag-drop + AI-assisted content works; H5P export is proven format.  
   - But consider self-contained HTML over H5P dependency.

7. **From `classroomio`:**  
   - Multi-org + multi-language + compliance tracking is enterprise pattern.  
   - MCP server + webhooks + REST API are integration points to offer.

8. **From `school_days`:**  
   - Holiday/exception YAML config is simple; adopt for Ferienkalender.  
   - Limitation: "one calendar only"—we'll need multi-Bundesland support.

9. **From `open-education-hub/oer-template`:**  
   - Docusaurus + GitHub Pages deployment is proven workflow.  
   - We target static HTML worksheets; template structure is reusable.

10. **From grading tools (`Notenschlüssel`, `owbezick/Standards-Based-Gradebook`):**  
    - German Notenschlüssel (grade scales by Bundesland) is niche but critical.  
    - Standards-based grading is emerging in US; less mature in DE.  
    - Build Anforderungsbereiche + Notenschlüssel lookup into test generator.

---

## Recommendations

1. **Reuse rather than rebuild:** Consider licensing FWU-DE lehrplan-ontologie or negotiating data access.
2. **Adopt CASS/xAPI as fallback:** If classroom integration needed, xAPI statements describe learned → coverage ledger.
3. **Model on `teaching-skills` sequence:** Backward design (outcomes) → Assessment → Lesson generation is proven.
4. **Target H5P export + self-contained HTML:** Both Lumi-AI-Editor and `codebase-to-course` do this; use as reference.
5. **Build exercise-type skill library incrementally:** Start with 5 core types (gap-fill, matching, MC, reading comp, mediation); expand per feedback.
6. **Engage with Anthropic/Learning Commons:** Official tools (`k12-teacher-skills`) are actively maintained; collaboration/citation likely valued.
7. **Plan Lehrplan parsing carefully:** Contact Bundesland education ministries early; data structure varies.
8. **Test coverage ledger with 1 class, 1 week:** Proof-of-concept bidirectional tracking before scaling.
