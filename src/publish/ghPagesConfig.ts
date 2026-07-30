/**
 * GH Pages project-page config, derived from `$GITHUB_REPOSITORY` (auto-set by every GitHub
 * Actions step, `owner/repo`) so a repo rename doesn't require a code change. Falls back to the
 * current repo's actual name for local dev/tests, where that env var isn't set.
 *
 * Single source of truth for `buildStaticCalendarBundle.ts` (Vite base path) and
 * `generateIcs.ts` (absolute site URLs) -- pure env-var + string logic, no Vite/Node build
 * dependency, safe for either to import.
 */
const FALLBACK_REPO = "ThHanke/englishLessons";

const [owner = "", repo = ""] = (process.env.GITHUB_REPOSITORY ?? FALLBACK_REPO).split("/");

/** e.g. `/englishLessons/` -- Vite `base` config for a GH Pages project page. */
export const GH_PAGES_BASE = `/${repo}/`;

/** e.g. `https://thhanke.github.io/englishLessons` (no trailing slash). */
export const SITE_BASE_URL = `https://${owner.toLowerCase()}.github.io/${repo}`;
