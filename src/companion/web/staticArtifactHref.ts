/** Static-build (GitHub Pages) equivalents of `calendarMapping.ts`'s `lessonPlanPageHref`/etc. --
 * kept as a separate module rather than a mode-branching version of the dev-mode builders,
 * because the two address spaces are structurally different: dev mode resolves root-relative
 * `/api/artifacts/...` URLs against the dev server's own origin, while the static site has no
 * such route and is deployed under an unknown subpath (GitHub Pages project page). These return
 * page-relative paths (no leading slash) so they resolve correctly regardless of that subpath --
 * the caller (`LessonDetailModal` in `linkMode="static"`) is responsible for choosing which
 * module to use, so the divergence is visible in code review rather than hidden in a conditional. */
export function staticLessonPlanHref(classId: string, date: string, slotId?: string): string {
  return slotId
    ? `classes/${classId}/${date}/${slotId}/lesson-plan/`
    : `classes/${classId}/${date}/lesson-plan/`;
}

export function staticHomeworkHref(classId: string, date: string, slotId?: string): string {
  return slotId
    ? `classes/${classId}/${date}/${slotId}/homework/`
    : `classes/${classId}/${date}/homework/`;
}

export function staticTestHref(classId: string, date: string, slotId?: string): string {
  return slotId
    ? `classes/${classId}/${date}/${slotId}/test/`
    : `classes/${classId}/${date}/test/`;
}
