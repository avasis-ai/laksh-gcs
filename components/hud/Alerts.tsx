"use client";

import { useMemo } from "react";

import { useStudio } from "../StudioProvider";
import { AlertTriangle } from "../icons";

interface ActiveAlert {
  id: string;
  text: string;
  tone: "alert" | "caution";
}

// Session budget — Reactor caps a session at 1200s (20 min). Warn before then.
const SESSION_CAP = 1200;
const WARN_AT = SESSION_CAP - 120;

/**
 * Critical, interruptive alerts (defence-grade signalling, playbook §4.5):
 * link loss / re-acquiring, session-budget expiry, command faults. Rendered
 * centre-top, unmissable. Derived purely from connection/session state so the
 * banner reflects ground truth every render.
 */
export function Alerts() {
  const { status, state, sessionSeconds, error, linkArmed } = useStudio();
  const started = Boolean(state?.started);

  const alerts = useMemo<ActiveAlert[]>(() => {
    const out: ActiveAlert[] = [];
    if (linkArmed && status === "disconnected") {
      out.push({ id: "link", text: "LINK LOST — RE-ACQUIRING", tone: "alert" });
    }
    if (started && sessionSeconds >= WARN_AT) {
      out.push({
        id: "budget",
        text: `SESSION EXPIRES IN ${Math.max(0, SESSION_CAP - sessionSeconds)}s`,
        tone: "caution",
      });
    }
    if (error) {
      out.push({ id: "fault", text: error.toUpperCase().slice(0, 64), tone: "alert" });
    }
    return out;
  }, [status, started, sessionSeconds, error, linkArmed]);

  if (alerts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-30 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="alert-flash flex items-center gap-2 rounded-md border px-3.5 py-1.5 backdrop-blur-sm"
          style={{
            borderColor: a.tone === "alert" ? "var(--danger)" : "var(--caution)",
            background: a.tone === "alert" ? "rgba(255,77,77,0.16)" : "rgba(240,163,36,0.16)",
            color: a.tone === "alert" ? "var(--danger)" : "var(--caution)",
          }}
        >
          <AlertTriangle width={14} height={14} />
          <span className="label-mono text-[11px]" style={{ color: "inherit" }}>
            {a.text}
          </span>
        </div>
      ))}
    </div>
  );
}
