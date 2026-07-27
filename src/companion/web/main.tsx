import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Calendar } from "./Calendar.tsx";
import { Chat } from "./Chat.tsx";
import "./index.css";

function App() {
  const baseUrl = window.location.origin;
  const [chatTarget, setChatTarget] = useState<{
    classId: string;
    date: string;
  } | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [serverAvailable, setServerAvailable] = useState(true);

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
    <div className="companion-app">
      <div className="companion-app-calendar">
        <Calendar
          baseUrl={baseUrl}
          month="2026-08-01"
          onOpenChat={(classId, date) => setChatTarget({ classId, date })}
        />
      </div>
      <div className="companion-app-chat">
        <Chat
          classId={chatTarget?.classId ?? null}
          date={chatTarget?.date ?? null}
          baseUrl={baseUrl}
          serverAvailable={serverAvailable}
          sessionToken={sessionToken}
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
