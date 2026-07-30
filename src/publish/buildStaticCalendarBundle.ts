import { renameSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { build as viteBuild } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** GH Pages base path -- this repo (`ThHanke/englishLeasons`) is a project page (no CNAME, no
 * `<user>.github.io` naming), so GitHub serves it at `https://thhanke.github.io/englishLeasons/`,
 * under a `/englishLeasons/` subpath. Verify against the repo's actual Pages settings
 * (`gh api repos/ThHanke/englishLeasons/pages`) if this repo is ever renamed or switched to a
 * custom domain -- getting this wrong breaks every static asset/link on deploy only, not locally. */
const GH_PAGES_BASE = "/englishLeasons/";

/**
 * Builds the static interactive Calendar bundle (`static-entry.tsx`/`static.html`) straight into
 * `outDir` (already created and populated by `buildSite.ts`'s non-Vite steps by the time this
 * runs). A genuinely novel build path for this repo -- the dev server only ever runs Vite in
 * middleware mode (`src/companion/server/index.ts`); this is the first real `vite.build()` call.
 * `emptyOutDir: false` is load-bearing: `buildSite.ts` has already written `classes/`, `data/`,
 * and `calendars/` into `outDir` by the time this runs, and Vite must not wipe them.
 */
export async function buildStaticCalendarBundle(params: {
  repoRoot: string;
  outDir: string;
}): Promise<void> {
  const { repoRoot, outDir } = params;
  const webRoot = join(repoRoot, "src/companion/web");

  await viteBuild({
    root: webRoot,
    configFile: false,
    base: GH_PAGES_BASE,
    plugins: [react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: join(webRoot, "static.html"),
      },
    },
  });

  // Vite names the emitted HTML after the entry file's own basename (static.html) -- it can't be
  // named index.html on disk since that name is already taken by the dev app's own entry in the
  // same source directory (src/companion/web/index.html -> main.tsx). Promote it to
  // site/index.html here, overwriting buildSite.ts's earlier plain-link root index -- the
  // interactive Calendar bundle *is* the root page now.
  const builtStaticHtml = join(outDir, "static.html");
  const finalIndexHtml = join(outDir, "index.html");
  if (existsSync(finalIndexHtml)) unlinkSync(finalIndexHtml);
  renameSync(builtStaticHtml, finalIndexHtml);
}
