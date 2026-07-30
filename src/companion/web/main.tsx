import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Calendar } from "./Calendar.tsx";
import { Chat } from "./Chat.tsx";
import { ResizableSplit } from "./ResizableSplit.tsx";
import "./index.css";

function App() {
  const baseUrl = window.location.origin;
  const [chatTarget, setChatTarget] = useState<{
    classId: string;
    date: string;
    slotId?: string;
  } | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [serverAvailable, setServerAvailable] = useState(true);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  useEffect(() => {
    fetch(new URL("/api/session-token", baseUrl).toString())
      .then((r) => r.json())
      .then((data) => {
        setSessionToken(data.token);
        setServerAvailable(true);
      })
      .catch(() => {
        setServerAvailable(false);
      });
  }, [baseUrl]);

  return (
    <ResizableSplit
      defaultLeftFraction={0.67}
      minLeftPx={480}
      minRightPx={280}
      storageKey="companion-split-ratio"
      leftClassName="companion-split-pane-scroll"
      left={
        <Calendar
          baseUrl={baseUrl}
          month="2026-08-01"
          onOpenChat={(classId, date, slotId) =>
            setChatTarget({ classId, date, slotId })
          }
          refreshKey={calendarRefreshKey}
        />
      }
      right={
        <Chat
          classId={chatTarget?.classId ?? null}
          date={chatTarget?.date ?? null}
          slotId={chatTarget?.slotId}
          baseUrl={baseUrl}
          serverAvailable={serverAvailable}
          sessionToken={sessionToken}
          onTurnComplete={() => setCalendarRefreshKey((k) => k + 1)}
        />
      }
    />
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
