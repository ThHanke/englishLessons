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
import { renderVocabIntroHtml } from "../../widgets/vocabIntro.ts";
import type { LessonSpec } from "../../schema/types.ts";
import { resolveKnownVocabulary } from "../../vocab/resolveKnownVocabulary.ts";
import { findNewVocabulary } from "../../vocab/findNewVocabulary.ts";

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

/** §4.2 step 1's structured plan body -- objectives/timed stages/differentiation notes/planned
 * exercises -- distinct from LessonSpecSchema (the pre-generation constraints the plan is built
 * from) and from the actual generate_exercise calls (the plan's exercisePlan entries are a plain
 * description of intent, not the typed items generate_exercise itself validates). */
const LessonPlanSchema = {
  class: z.string(),
  date: z.string(),
  objectives: z.array(z.string()),
  stages: z.array(
    z.object({
      name: z.string(),
      durationMinutes: z.number().int().positive(),
      description: z.string(),
    }),
  ),
  differentiationNotes: z.string(),
  exercisePlan: z.array(z.string()),
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

const GenerateVocabIntroSchema = {
  title: z.string(),
  words: z.array(z.object({ word: z.string(), translation: z.string() })),
};

/** Plain-English strings authored for a material, extracted from the already-validated
 * (Zod-parsed) items generate_exercise has in hand -- deliberately not scraped back out of the
 * rendered HTML, which is full of instructional/UI chrome text (button labels, prompts) that
 * would pollute vocabulary scanning. Consumed by find_new_vocabulary. */
function extractContentText(type: string, items: unknown[]): string[] {
  if (type === "gap_fill") {
    return (items as GapFillItem[]).flatMap((it) => [
      it.sentence,
      ...it.blanks.map((b) => b.answer),
      ...it.blanks.filter((b) => b.hint).map((b) => b.hint!),
    ]);
  }
  if (type === "mcq") {
    return (items as McqItem[]).flatMap((it) => [it.question, ...it.options]);
  }
  if (type === "matching") {
    return (items as MatchingPair[]).flatMap((it) => [it.left, it.right]);
  }
  if (type === "error_correction") {
    return (items as ErrorCorrectionItem[]).flatMap((it) => [it.sentence, it.correction]);
  }
  return (items as CrosswordItem[]).flatMap((it) => [it.word, it.clue]);
}

interface ManifestEntry {
  file: string;
  type: string;
  title: string;
  competenceIds: string[];
  depth: string;
  createdAt: string;
  /** Plain-text content this material was authored from -- find_new_vocabulary's scanning
   * source. Absent on entries written before this field existed. */
  contentText?: string[];
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
        "save_lesson_plan",
        "Save the structured lesson-plan body (objectives, timed stages, differentiation notes, and the list of exercises you plan to build) for the current lesson -- this is what renders as the teacher-facing lesson-plan page, separate from the lesson-spec constraints. The 'class' and 'date' fields MUST match the current session.",
        LessonPlanSchema,
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
          const filePath = join(baseDir, "lesson-plan.json");
          atomicWriteFileSync(filePath, JSON.stringify(args, null, 2));

          return {
            content: [
              {
                type: "text",
                text: `Saved lesson plan to artifacts/${classId}/${date}/lesson-plan.json`,
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
            contentText: extractContentText(args.type, parsedItems.data),
            createdAt: new Date().toISOString(),
          });
          atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2));

          const relPath = `artifacts/${classId}/${date}/materials/${fileName}`;
          return {
            content: [{ type: "text", text: `Saved ${args.type} exercise to ${relPath}` }],
          };
        },
      ),
      tool(
        "find_new_vocabulary",
        "Scans this lesson's lesson-spec and any already-generated materials for vocabulary used, and reports which words are genuinely new (not yet in the class's known-vocabulary chain). Call this before generate_vocab_intro so you know which words need a translation.",
        {},
        async () => {
          const specPath = join(baseDir, "lesson-spec.json");
          if (!existsSync(specPath)) {
            return {
              content: [
                {
                  type: "text",
                  text: "No lesson-spec.json saved yet for this date -- save one first (it carries known_vocab_ref, needed to know what's already known).",
                },
              ],
              isError: true,
            };
          }
          const spec = JSON.parse(readFileSync(specPath, "utf-8")) as LessonSpec;

          const texts: string[] = [
            spec.module.title,
            spec.content_field.text,
            ...spec.focus_competences.map((fc) => fc.topic),
          ];

          const manifestPath = join(baseDir, "manifest.json");
          if (existsSync(manifestPath)) {
            const manifest = readManifest(manifestPath, classId, date);
            for (const entry of manifest.materials) {
              if (entry.contentText) texts.push(...entry.contentText);
            }
          }

          let known: Set<string>;
          try {
            known = resolveKnownVocabulary(spec.known_vocab_ref, repoRoot);
          } catch (err) {
            return {
              content: [{ type: "text", text: `Could not resolve known vocabulary: ${(err as Error).message}` }],
              isError: true,
            };
          }

          const newWords = findNewVocabulary({ texts, known });
          if (newWords.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No new vocabulary found -- everything scanned in this lesson is already in the known-vocabulary chain.",
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text",
                text: `New vocabulary found (${newWords.length}): ${newWords.join(", ")}. Provide a German translation for each you want to pre-teach, then call generate_vocab_intro.`,
              },
            ],
          };
        },
      ),
      tool(
        "generate_vocab_intro",
        "Save a pre-taught vocabulary glossary (word + German translation + read-aloud button) for genuinely new words in this lesson. Call find_new_vocabulary first to identify which words to include.",
        GenerateVocabIntroSchema,
        async (args) => {
          const slug = slugify(args.title);
          if (!slug) {
            return {
              content: [{ type: "text", text: "Rejected: title produces an empty slug." }],
              isError: true,
            };
          }

          const html = renderVocabIntroHtml(args.title, args.words);

          const materialsDir = join(baseDir, "materials");
          mkdirSync(materialsDir, { recursive: true });
          const fileName = `vocab_intro-${slug}.html`;
          const filePath = join(materialsDir, fileName);
          atomicWriteFileSync(filePath, html);

          let competenceIds: string[] = [];
          const specPath = join(baseDir, "lesson-spec.json");
          if (existsSync(specPath)) {
            const spec = JSON.parse(readFileSync(specPath, "utf-8")) as LessonSpec;
            competenceIds = spec.focus_competences.map((fc) => fc.id);
          }

          mkdirSync(baseDir, { recursive: true });
          const manifestPath = join(baseDir, "manifest.json");
          const manifest = readManifest(manifestPath, classId, date);
          manifest.materials.push({
            file: `materials/${fileName}`,
            type: "vocab_intro",
            title: args.title,
            competenceIds,
            // Pre-teaching a glossary introduces vocabulary but doesn't practice/assess it --
            // 'introduced' is the correct depth here, distinct from generate_exercise's 'practiced'.
            depth: "introduced",
            contentText: args.words.map((w) => `${w.word} ${w.translation}`),
            createdAt: new Date().toISOString(),
          });
          atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2));

          const relPath = `artifacts/${classId}/${date}/materials/${fileName}`;
          return {
            content: [{ type: "text", text: `Saved vocabulary introduction to ${relPath}` }],
          };
        },
      ),
    ],
  });
}
