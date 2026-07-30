import { createRoot } from "react-dom/client";
import { Calendar } from "./Calendar.tsx";
import "./index.css";

/** GH Pages static bundle entry -- mounts only the read-only interactive Calendar, no Chat/
 * planning panel (there's no dev server behind this to plan against). `staticDataUrl` points at
 * `buildSite.ts`'s pre-generated `data/calendar-data.json` (page-relative, so it resolves
 * correctly under the deployed subpath); `linkMode="static"` threads through to
 * `LessonDetailModal` so its artifact links use the static page-relative href builders instead of
 * the dev server's `/api/artifacts/...` routes. */
function StaticApp() {
  return (
    <div className="companion-split-root" style={{ height: "100vh" }}>
      <div className="companion-split-pane" style={{ flexBasis: "100%" }}>
        <Calendar
          baseUrl={window.location.origin}
          month={new Date().toISOString().slice(0, 10)}
          onOpenChat={() => {}}
          staticDataUrl="data/calendar-data.json"
          linkMode="static"
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<StaticApp />);
