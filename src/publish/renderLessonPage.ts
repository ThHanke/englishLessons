import { basename } from "node:path";
import type { LessonSpec } from "../schema/types.ts";

/** §4.7 static-site manifest entry — one per generated/cited material for a lesson date. */
export interface ManifestEntry {
  file: string;
  type: string;
  title: string;
  competenceIds: string[];
  depth: string;
  createdAt: string;
}

export interface Manifest {
  materials: ManifestEntry[];
}

/** Duplicated from src/widgets/gapFill.ts (not exported there) - see U5 plan note. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Pure renderer: `LessonSpec` + optional `Manifest` + the raw material filenames actually
 * present on disk for this date -> a self-contained lesson page. No filesystem access here;
 * `buildSite.ts` owns discovering `materialFiles` and copying them alongside this page.
 *
 * When a manifest entry exists for a given file (matched by `file` name), its `title`/`type`
 * are used as link text; otherwise the raw filename is used. When `materialFiles` is empty
 * (no manifest, no materials generated yet for this date), a "no materials yet" note is
 * rendered instead of an empty list.
 */
export function renderLessonPage(params: {
  spec: LessonSpec;
  manifest?: Manifest | null;
  materialFiles: string[];
}): string {
  const { spec, manifest, materialFiles } = params;

  const competencesHtml = spec.focus_competences
    .map((fc) => `<li>${escapeHtml(fc.id)} — ${escapeHtml(fc.topic)}</li>`)
    .join("\n");

  const materialsHtml =
    materialFiles.length === 0
      ? `<p class="no-materials">No materials yet.</p>`
      : `<ul class="materials">\n${materialFiles
          .map((file) => {
            // manifest entries store `file` as "materials/<name>" (artifactTools.ts's
            // generate_exercise), while `materialFiles` here are bare filenames from a
            // directory read -- match on basename so the two conventions don't silently
            // fail to line up.
            const entry = manifest?.materials.find((m) => basename(m.file) === file);
            const linkText = entry ? `${entry.title} (${entry.type})` : file;
            return `<li><a href="materials/${escapeHtml(file)}">${escapeHtml(linkText)}</a></li>`;
          })
          .join("\n")}\n</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.module.title)} — ${escapeHtml(spec.date)}</title>
<style>
  body { font-family: sans-serif; max-width: 40rem; margin: 2rem auto; }
  ul { padding-left: 1.2rem; }
  .no-materials { color: #666; font-style: italic; }
</style>
</head>
<body>
<h1>${escapeHtml(spec.module.title)}</h1>
<p><strong>Class:</strong> ${escapeHtml(spec.class)} &middot; <strong>Date:</strong> ${escapeHtml(spec.date)} &middot; <strong>Phase:</strong> ${escapeHtml(spec.phase)}</p>
<h2>Focus competences</h2>
<ul>
${competencesHtml}
</ul>
<h2>Materials</h2>
${materialsHtml}
</body>
</html>
`;
}
