import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod/v4";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

const LessonSpecSchema = {
  class: z.string(),
  date: z.string(),
  school_week: z.number().int(),
  module: z.object({
    id: z.string(),
    title: z.string(),
    week_in_module: z.number().int(),
    of: z.number().int(),
  }),
  phase: z.string(),
  pace_factor: z.number(),
  pace_reason: z.string(),
  focus_competences: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      mode: z.array(z.string()),
    }),
  ),
  content_field: z.object({ id: z.string(), text: z.string() }),
  text_types: z.array(z.string()),
  milestone_context: z.object({
    next: z.string(),
    in_slots: z.number().int(),
    assesses: z.array(z.string()),
  }),
  prior_covered: z.array(z.string()),
  cefr_target: z.string(),
  known_vocab_ref: z.string(),
  textbook_refs: z.array(
    z.object({
      book: z.string(),
      citation: z.string(),
      slot: z.string(),
    }),
  ),
  suggested_exercise_types: z.array(z.string()),
  curriculum_ref: z.string(),
};

const MaterialSchema = {
  type: z.enum(["exercise", "homework", "test", "notes"]),
  title: z.string(),
  content: z.string(),
  format: z.enum(["md", "html"]),
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

export function createLessonArtifactServer(params: {
  classId: string;
  date: string;
  repoRoot: string;
}): McpSdkServerConfigWithInstance {
  const { classId, date, repoRoot } = params;
  const baseDir = join(repoRoot, "artifacts", classId, date);

  return createSdkMcpServer({
    name: "companion-artifacts",
    tools: [
      tool(
        "save_lesson_spec",
        "Save a validated lesson-spec.json for the current lesson. The 'class' and 'date' fields MUST match the current session.",
        LessonSpecSchema,
        async (args) => {
          if (args.class !== classId) {
            return {
              content: [
                {
                  type: "text",
                  text: `Rejected: 'class' must be "${classId}" but got "${args.class}".`,
                },
              ],
              isError: true,
            };
          }
          if (args.date !== date) {
            return {
              content: [
                {
                  type: "text",
                  text: `Rejected: 'date' must be "${date}" but got "${args.date}".`,
                },
              ],
              isError: true,
            };
          }

          mkdirSync(baseDir, { recursive: true });
          const filePath = join(baseDir, "lesson-spec.json");
          atomicWriteFileSync(filePath, JSON.stringify(args, null, 2));

          return {
            content: [
              {
                type: "text",
                text: `Saved lesson-spec to artifacts/${classId}/${date}/lesson-spec.json`,
              },
            ],
          };
        },
      ),
      tool(
        "save_material",
        "Save a supplementary material (exercise, homework, test, or notes) for the current lesson.",
        MaterialSchema,
        async (args) => {
          const slug = slugify(args.title);
          if (!slug) {
            return {
              content: [
                { type: "text", text: "Rejected: title produces an empty slug." },
              ],
              isError: true,
            };
          }

          const materialsDir = join(baseDir, "materials");
          mkdirSync(materialsDir, { recursive: true });

          const fileName = `${args.type}-${slug}.${args.format}`;
          const filePath = join(materialsDir, fileName);
          atomicWriteFileSync(filePath, args.content);

          const relPath = `artifacts/${classId}/${date}/materials/${fileName}`;
          return {
            content: [{ type: "text", text: `Saved material to ${relPath}` }],
          };
        },
      ),
    ],
  });
}
