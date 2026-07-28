import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod/v4";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { renderGapFillHtml, type GapFillItem } from "../../widgets/gapFill.ts";
import { renderMcqHtml, type McqItem } from "../../widgets/mcq.ts";
import { renderMatchingHtml, type MatchingPair } from "../../widgets/matching.ts";
import { renderErrorCorrectionHtml, type ErrorCorrectionItem } from "../../widgets/errorCorrection.ts";
import { renderCrosswordHtml, type CrosswordItem } from "../../widgets/crossword.ts";

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

export const MaterialSchema = {
  type: z.enum(["homework", "test", "notes"]),
  title: z.string(),
  content: z.string(),
  format: z.enum(["md", "html"]),
};

const GapFillItemSchema = z.object({
  sentence: z.string(),
  blanks: z.array(
    z.object({ answer: z.string(), position: z.number().int(), hint: z.string().optional() }),
  ),
});

const McqItemSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correctIndex: z.number().int(),
});

const MatchingPairSchema = z.object({
  left: z.string(),
  right: z.string(),
});

const ErrorCorrectionItemSchema = z.object({
  sentence: z.string(),
  correction: z.string(),
  errorType: z.string().optional(),
});

const CrosswordItemSchema = z.object({
  word: z.string(),
  clue: z.string(),
});

/** Per-type `items` shapes, keyed by `GenerateExerciseSchema.type` -- validated a level down from
 * the outer schema so a `gap_fill` request can't smuggle `mcq`-shaped items (KTD1). */
const ITEMS_SCHEMA_BY_TYPE = {
  gap_fill: z.array(GapFillItemSchema),
  mcq: z.array(McqItemSchema),
  matching: z.array(MatchingPairSchema),
  error_correction: z.array(ErrorCorrectionItemSchema),
  crossword: z.array(CrosswordItemSchema),
} as const;

const GenerateExerciseSchema = {
  type: z.enum(["gap_fill", "mcq", "matching", "error_correction", "crossword"]),
  title: z.string(),
  competenceIds: z.array(z.string()),
  items: z.array(z.unknown()),
};

interface ManifestEntry {
  file: string;
  type: string;
  title: string;
  competenceIds: string[];
  depth: string;
  createdAt: string;
}

interface Manifest {
  class: string;
  date: string;
  materials: ManifestEntry[];
}

function readManifest(manifestPath: string, classId: string, date: string): Manifest {
  if (!existsSync(manifestPath)) {
    return { class: classId, date, materials: [] };
  }
  return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
}

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
      tool(
        "generate_exercise",
        "Generate a typed exercise widget (gap_fill, mcq, matching, error_correction, or crossword) for specific competences and save it as a self-contained, self-checking worksheet.",
        GenerateExerciseSchema,
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

          const itemsSchema = ITEMS_SCHEMA_BY_TYPE[args.type];
          const parsedItems = itemsSchema.safeParse(args.items);
          if (!parsedItems.success) {
            return {
              content: [
                {
                  type: "text",
                  text: `Rejected: 'items' doesn't match the shape expected for type "${args.type}": ${parsedItems.error.message}`,
                },
              ],
              isError: true,
            };
          }

          let html: string;
          if (args.type === "gap_fill") {
            html = renderGapFillHtml(args.title, parsedItems.data as GapFillItem[]);
          } else if (args.type === "mcq") {
            html = renderMcqHtml(args.title, parsedItems.data as McqItem[]);
          } else if (args.type === "matching") {
            html = renderMatchingHtml(args.title, parsedItems.data as MatchingPair[]);
          } else if (args.type === "error_correction") {
            html = renderErrorCorrectionHtml(args.title, parsedItems.data as ErrorCorrectionItem[]);
          } else {
            html = renderCrosswordHtml(args.title, parsedItems.data as CrosswordItem[]);
          }

          const materialsDir = join(baseDir, "materials");
          mkdirSync(materialsDir, { recursive: true });
          const fileName = `${args.type}-${slug}.html`;
          const filePath = join(materialsDir, fileName);
          atomicWriteFileSync(filePath, html);

          mkdirSync(baseDir, { recursive: true });
          const manifestPath = join(baseDir, "manifest.json");
          const manifest = readManifest(manifestPath, classId, date);
          manifest.materials.push({
            file: `materials/${fileName}`,
            type: args.type,
            title: args.title,
            competenceIds: args.competenceIds,
            // KTD3: exercise generation always records 'practiced' for now -- the escalation to
            // 'assessed' depends on the not-yet-built klassenarbeit skill/test context.
            depth: "practiced",
            createdAt: new Date().toISOString(),
          });
          atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2));

          const relPath = `artifacts/${classId}/${date}/materials/${fileName}`;
          return {
            content: [{ type: "text", text: `Saved ${args.type} exercise to ${relPath}` }],
          };
        },
      ),
    ],
  });
}
