/** Dev bootstrap entry — mounts the Calendar against the real running companion server. U6
 * replaces this with the full app shell (class switcher, chat tab, R10 handshake); until then
 * this is enough to visually check the calendar against real repo data via `npm run dev`. */
import { createRoot } from "react-dom/client";
import { Calendar } from "./Calendar.tsx";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <Calendar
    baseUrl={window.location.origin}
    month="2026-08-01"
    onOpenChat={(classId, date) => console.log("onOpenChat", classId, date)}
  />,
);
