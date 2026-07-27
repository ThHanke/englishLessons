---
title: "feat: Companion agent artifact tools (save_lesson_spec, save_material)"
type: feat
status: done
date: 2026-07-27
---

# feat: Companion agent artifact tools

## Overview

The companion agent can read lesson context but cannot persist anything. This adds two in-process MCP tools — `save_lesson_spec` and `save_material` — so the agent can write artifacts scoped strictly to the current session's class+date. The existing `buildLedger` pipeline picks up saved lesson-specs automatically, closing the coverage feedback loop without any ledger changes.

## Problem Frame

Teachers use the chat to plan lessons and create materials. The agent produces good output as chat text, but nothing persists: no lesson-spec is written, no exercises are saved, and the coverage/gap system never updates. The agent has `Edit`/`Write`/`Bash` disallowed for safety. We need narrowly-scoped write tools that enforce single-lesson boundaries.

## Requirements Trace

- R1. Agent can save a validated `lesson-spec.json` for the current session's class+date
- R2. Agent can save supplementary materials (exercises, homework, tests, notes) for the current lesson
- R3. Both tools enforce that writes target only the current session's class+date — no cross-lesson writes possible
- R4. Saved lesson-specs are picked up by `buildLedger` on next calendar load (no ledger changes needed)
- R5. Agent system prompt tells the agent about the tools and how to use them
- R6. Materials follow the existing `artifacts/<class>/<date>/materials/` convention
- R7. `zod` added as explicit dependency (currently transitive only via agent SDK)

## Scope Boundaries

- `buildLedger.ts` and `coverageLedger()` are NOT modified — they already handle lesson-spec progression
- `DISALLOWED_TOOLS` stays as-is — `Edit`/`Write`/`Bash` remain blocked
- No frontend changes — the chat already displays agent responses; material links are a future concern
- No new HTTP routes — tools run in-process via SDK MCP server
- No delivery confirmation ("practiced"/"assessed" depth upgrades) — that's a separate feature

## Context & Research

### Relevant Code and Patterns

- `src/companion/server/agentSession.ts` — `buildQueryOptions()` at line 84 is the single point where SDK `Options` are assembled; `mcpServers` goes here
- `src/companion/server/buildLedger.ts` — `walkLessonSpecFiles()` recursively finds `lesson-spec.json` under `artifacts/<class>/`; `lessonSpecToCoverage()` converts each to coverage at "introduced" depth
- `src/companion/server/routes/chat.ts` — extracts `classId`, `date` from POST body and passes to `runAgentTurnStream`
- `src/schema/types.ts:209-227` — `LessonSpec` interface (the validation target)
- `artifacts/grade-7-realschule-2026/2026-08-21/` — existing artifact with `lesson-spec.json` + `materials/01-gap-fill-passive-voice.html`

### SDK API Surface

- `createSdkMcpServer({ name, tools })` returns `McpSdkServerConfigWithInstance`
- `SdkMcpToolDefinition<Schema>`: `{ name, description, inputSchema: ZodRawShape, handler }`
- `inputSchema` accepts both Zod 3 and Zod v4 `ZodRawShape` objects
- Pass result into `Options.mcpServers` as `Record<string, McpServerConfig>`
- Tools appear as MCP tools to the agent — called like any other tool, results returned as `CallToolResult`

## Key Technical Decisions

- **In-process MCP server per session**: The MCP server is created fresh for each `runAgentTurnStream` call with `classId`+`date` captured in closure. This means tools physically cannot write to a different lesson — the scope enforcement is structural, not just validation.
- **Zod v4 for input schemas**: The SDK imports `z` from `zod/v4`. We'll use the same import for consistency. Add `zod` to `package.json` to make the transitive dep explicit.
- **Validation via Zod, not TypeScript types**: The `LessonSpec` interface in `types.ts` is a TypeScript type only. We define a Zod schema that matches it for runtime validation in the tool handler. This is a parallel definition — kept minimal and focused on structure, not a full rewrite of the type system.
- **Handler writes directly to disk**: Tool handlers use `writeFileSync` / `mkdirSync` to write to `artifacts/<classId>/<date>/`. Simple, no intermediate queue or API.
- **Material naming convention**: Materials use `<type>-<slugified-title>.<format>` inside `materials/` subdirectory, matching the existing `01-gap-fill-passive-voice.html` pattern but with type prefix instead of number.

## Open Questions

### Resolved During Planning

- **Should we validate competence IDs against modules.yaml?** No — the agent already receives valid IDs in seed context. Over-validating would make the tool brittle when curriculum files change. Basic structural validation is sufficient.
- **Where does the MCP server get created?** In a new module `src/companion/server/artifactTools.ts` — keeps tool definitions separate from session management.

### Deferred to Implementation

- **Exact Zod schema shape**: Will mirror `LessonSpec` fields but exact optional/required decisions happen during implementation when testing against real agent output.
- **Material format options**: Starting with `md` and `html`. May add `json` later based on what the agent actually produces.

## Output Structure

```
src/companion/server/
  artifactTools.ts          # NEW — createLessonArtifactServer()
  artifactTools.test.ts     # NEW — unit tests
  agentSession.ts           # MODIFY — wire MCP server into buildQueryOptions
```

## Implementation Units

- [x] **Unit 1: Add zod dependency**

**Goal:** Make zod an explicit dependency so tool schemas don't rely on a transitive import.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `package.json`

**Approach:**
- `npm install zod` — this gets the same version the SDK already pulls in
- Import as `import { z } from "zod/v4"` in new files, matching SDK convention

**Test expectation:** none — dependency addition only

**Verification:**
- `import { z } from "zod/v4"` resolves without error in new module

---

- [x] **Unit 2: Create `artifactTools.ts` with `save_lesson_spec` tool**

**Goal:** Implement the in-process MCP server with a `save_lesson_spec` tool that validates and writes `lesson-spec.json` scoped to a specific class+date.

**Requirements:** R1, R3, R4

**Dependencies:** Unit 1

**Files:**
- Create: `src/companion/server/artifactTools.ts`
- Test: `src/companion/server/artifactTools.test.ts`

**Approach:**
- Export `createLessonArtifactServer(params: { classId: string, date: string, repoRoot: string })` that returns `McpSdkServerConfigWithInstance`
- Internally calls `createSdkMcpServer({ name: "companion-artifacts", tools: [...] })`
- `save_lesson_spec` tool:
  - `inputSchema`: Zod v4 object matching `LessonSpec` structure (class, date, module, phase, focus_competences, etc.)
  - Handler validates `args.class === classId` and `args.date === date` — rejects with clear error if mismatched
  - Writes to `<repoRoot>/artifacts/<classId>/<date>/lesson-spec.json`
  - Creates directories with `mkdirSync({ recursive: true })`
  - Returns `{ content: [{ type: "text", text: "Saved lesson-spec..." }] }` on success

**Patterns to follow:**
- `buildLedger.ts` for the `artifacts/<class>/<date>/` path convention
- `sessionIndex.ts` for the write-then-rename atomic write pattern
- Existing `lesson-spec.json` in `artifacts/grade-7-realschule-2026/2026-08-21/` for output format

**Test scenarios:**
- Happy path: valid LessonSpec with matching class+date → file written to correct path, content matches input
- Error path: class field doesn't match session classId → rejection with clear error message, no file written
- Error path: date field doesn't match session date → rejection with clear error message
- Edge case: artifacts directory doesn't exist yet → created automatically, file written
- Happy path: overwriting existing lesson-spec → file replaced with new content

**Verification:**
- `buildLedger` reads a spec written by this tool and produces correct ledger entries
- Tool rejects any attempt to write outside session scope

---

- [x] **Unit 3: Add `save_material` tool to the MCP server**

**Goal:** Add a second tool for saving supplementary materials (exercises, homework, tests, notes) scoped to the current lesson.

**Requirements:** R2, R3, R6

**Dependencies:** Unit 2

**Files:**
- Modify: `src/companion/server/artifactTools.ts`
- Modify: `src/companion/server/artifactTools.test.ts`

**Approach:**
- Add `save_material` tool to the same `createSdkMcpServer` call
- `inputSchema`: `{ type: z.enum(["exercise", "homework", "test", "notes"]), title: z.string(), content: z.string(), format: z.enum(["md", "html"]) }`
- Handler:
  - Slugifies title (lowercase, replace spaces/special chars with dashes, truncate)
  - Writes to `<repoRoot>/artifacts/<classId>/<date>/materials/<type>-<slug>.<format>`
  - Creates `materials/` subdirectory if needed
  - Returns confirmation with the relative path

**Patterns to follow:**
- Existing `artifacts/grade-7-realschule-2026/2026-08-21/materials/01-gap-fill-passive-voice.html`

**Test scenarios:**
- Happy path: save exercise as HTML → file at `materials/exercise-<slug>.html` with correct content
- Happy path: save homework as markdown → file at `materials/homework-<slug>.md`
- Edge case: title with special characters → slugified cleanly (no spaces, no slashes)
- Edge case: materials directory doesn't exist → created automatically
- Happy path: saving multiple materials → each gets its own file, no overwrites between different types/titles

**Verification:**
- Materials directory contains files matching naming convention
- Content written matches content provided

---

- [x] **Unit 4: Wire MCP server into `buildQueryOptions` and agent session flow**

**Goal:** Create the per-session MCP server in the chat request flow and pass it through to the SDK `query()` call.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 2

**Files:**
- Modify: `src/companion/server/agentSession.ts`
- Modify: `src/companion/server/routes/chat.ts` (only if params type changes)

**Approach:**
- Expand `buildQueryOptions` signature to accept optional `mcpServers: Record<string, McpServerConfig>`
- In `runAgentTurnStream` (and `runAgentTurn`), before calling `startQuery`:
  - Import and call `createLessonArtifactServer({ classId, date, cwd })`
  - Pass result as `mcpServers: { "companion-artifacts": artifactServer }` to `buildQueryOptions`
- `buildQueryOptions` spreads `mcpServers` into the returned `Options` object
- No changes to `AgentTurnParams` — `classId`, `date`, `cwd` are already there
- No changes to the chat route — it already passes all needed fields

**Patterns to follow:**
- Existing `buildQueryOptions` structure for adding new `Options` fields

**Test scenarios:**
- Integration: `buildQueryOptions` with mcpServers included → Options object contains the server config
- Happy path: `runAgentTurnStream` creates artifact server with correct classId/date from params

**Verification:**
- Agent SDK receives the MCP server in its options
- Agent can invoke `save_lesson_spec` and `save_material` tools during a chat session

---

- [x] **Unit 5: Update COMPANION_INSTRUCTIONS to describe artifact tools**

**Goal:** Tell the agent about `save_lesson_spec` and `save_material` so it knows when and how to use them.

**Requirements:** R5

**Dependencies:** Unit 4

**Files:**
- Modify: `src/companion/server/agentSession.ts`

**Approach:**
- Add a `## Saving your work` section to `COMPANION_INSTRUCTIONS`
- Explain: when the teacher approves a lesson plan, call `save_lesson_spec` with the full spec
- Explain: when creating materials, call `save_material` with type, title, content, format
- Emphasize: the `class` and `date` fields in `save_lesson_spec` MUST match the current session — the tool will reject mismatches
- Explain: saved lesson-specs update the coverage tracking automatically; saved materials become available as lesson attachments
- Tell agent to always confirm with teacher before saving (advisory, not enforced)

**Test expectation:** none — prompt text change only; verified by manual testing

**Verification:**
- Agent mentions save capability in its opening response
- Agent calls `save_lesson_spec` after teacher approves a plan
- Agent calls `save_material` after creating exercises/homework/tests

## System-Wide Impact

- **Interaction graph:** `save_lesson_spec` → writes `lesson-spec.json` → `buildLedger` reads on next calendar load → `gapReport` recalculates → `dateContext` reflects updated gaps in next chat session
- **Error propagation:** Tool handler errors return as `CallToolResult` with `isError: true` — agent sees the error and can retry or inform teacher. No server crash.
- **State lifecycle risks:** Concurrent writes to same class+date are possible if two browser tabs open same lesson. Mitigated: `writeFileSync` is atomic-enough for single-process, and last-write-wins is acceptable (teacher is the same person).
- **Unchanged invariants:** `DISALLOWED_TOOLS` still blocks `Edit`/`Write`/`Bash`. Coverage ledger computation logic unchanged. Calendar API unchanged. Frontend unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Agent generates invalid LessonSpec JSON | Zod validation rejects with clear field-level errors; agent retries |
| Agent tries to write to wrong lesson | Structural enforcement via closure — classId/date baked into server creation |
| Transitive zod version drift | Adding explicit dep pins version; SDK and tools share same zod |
| Large material content exceeds MCP limits | HTML exercises are typically <10KB; not a practical concern |

## Sources & References

- SDK types: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (createSdkMcpServer, SdkMcpToolDefinition, Options)
- Existing artifact: `artifacts/grade-7-realschule-2026/2026-08-21/lesson-spec.json`
- LessonSpec type: `src/schema/types.ts:209-227`
- Coverage pipeline: `src/coverage/ledger.ts`, `src/coverage/gapReport.ts`
