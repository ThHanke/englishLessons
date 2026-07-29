import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { loadYaml } from "../../../schema/yaml.ts";
import type { ClassFile, LessonSpec } from "../../../schema/types.ts";
import { renderLessonPage, type LessonPlan, type Manifest } from "../../../publish/renderLessonPage.ts";
import { originMatches } from "../security.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".html": "text/html",
  ".json": "application/json",
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Mirrors dateContext.ts's loadClassData walk, scoped to just an existence check -- this route
 * only needs to know `className` is a real class, not its modulesFile. */
function isKnownClassName(className: string, repoRoot: string): boolean {
  const plansDir = join(repoRoot, "plans");
  if (!existsSync(plansDir)) return false;
  for (const gradeDir of readdirSync(plansDir)) {
    const dirPath = join(plansDir, gradeDir);
    if (!statSync(dirPath).isDirectory()) continue;
    const classPath = join(dirPath, "class.yaml");
    if (!existsSync(classPath)) continue;
    const classFile = loadYaml<ClassFile>(classPath);
    if (classFile.name === className) return true;
  }
  return false;
}

/**
 * `GET /api/artifacts/<class>/<date>/<...path>` (KTD6): a local-authoring convenience that
 * serves files straight from `<repoRoot>/artifacts/` so the calendar UI can link to materials
 * before a push. Read-only, no session token required (matches `GET /api/calendar`'s existing
 * unauthenticated-read posture) -- but this route DOES check Origin (unlike the other GET routes),
 * since it resolves attacker-influenced path segments against the filesystem instead of just
 * reading curated YAML/JSON.
 *
 * Validation order is load-bearing: `class` is checked against the known class list and `date`
 * against a strict format BEFORE any filesystem path is constructed from them. Only after that
 * whitelist passes does the remaining `<...path>` get resolved against the fixed `artifacts/`
 * root and checked to still be inside it. Anchoring the traversal check on `artifacts/<class>/
 * <date>/` before validating those two segments would let a value like `class=..` relocate the
 * "base" the check resolves against -- the whitelist has to come first.
 */
export async function handleArtifactsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: { repoRoot: string; expectedOrigin: string },
): Promise<void> {
  const originHeader = req.headers.origin;
  if (
    !originMatches(
      typeof originHeader === "string" ? originHeader : undefined,
      config.expectedOrigin,
    )
  ) {
    sendJson(res, 403, { error: "origin_rejected" });
    return;
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const segments = url.pathname
    .replace(/^\/api\/artifacts\//, "")
    .split("/")
    .map((s) => decodeURIComponent(s))
    .filter((s) => s.length > 0);

  if (segments.length < 3) {
    sendJson(res, 400, { error: "missing_path_segments" });
    return;
  }
  const [classId, date, ...restSegments] = segments as [string, string, ...string[]];

  if (!isKnownClassName(classId, config.repoRoot)) {
    sendJson(res, 400, { error: "unknown_class" });
    return;
  }
  if (!DATE_RE.test(date)) {
    sendJson(res, 400, { error: "malformed_date" });
    return;
  }

  const artifactsRoot = resolve(join(config.repoRoot, "artifacts"));
  const candidatePath = resolve(join(artifactsRoot, classId, date, ...restSegments));
  const rel = relative(artifactsRoot, candidatePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    sendJson(res, 400, { error: "invalid_path" });
    return;
  }

  if (restSegments.length === 1 && restSegments[0] === "lesson-spec.json") {
    const specPath = join(artifactsRoot, classId, date, "lesson-spec.json");
    if (!existsSync(specPath)) {
      sendJson(res, 404, { error: "not_found" });
      return;
    }
    const spec = JSON.parse(readFileSync(specPath, "utf-8")) as LessonSpec;
    const manifestPath = join(artifactsRoot, classId, date, "manifest.json");
    const manifest: Manifest | null = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest)
      : null;
    const planPath = join(artifactsRoot, classId, date, "lesson-plan.json");
    const plan: LessonPlan | null = existsSync(planPath)
      ? (JSON.parse(readFileSync(planPath, "utf-8")) as LessonPlan)
      : null;
    const materialsDir = join(artifactsRoot, classId, date, "materials");
    const materialFiles = existsSync(materialsDir)
      ? readdirSync(materialsDir)
          .filter((f) => f.endsWith(".html"))
          .sort()
      : [];
    const html = renderLessonPage({ spec, manifest, plan, materialFiles });
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
    return;
  }

  if (!existsSync(candidatePath) || statSync(candidatePath).isDirectory()) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  const contentType = CONTENT_TYPE_BY_EXT[extname(candidatePath)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": contentType });
  res.end(readFileSync(candidatePath));
}
