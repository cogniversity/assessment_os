import { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client";
import { PROCTORING_EVENT_LABELS } from "@assessment-os/shared";

export interface ProctoringFeedEntry {
  type: string;
  label: string;
  severity: "info" | "warn" | "critical";
  at: Date;
}

export interface ProctoringWarnings {
  tabLost: boolean;
  fullscreenLost: boolean;
}

export interface UseProctoringResult {
  warnings: ProctoringWarnings;
  recentEvents: ProctoringFeedEntry[];
  logProctor: (eventType: string) => void;
  requestFullscreenRestore: () => void;
}

const MAX_FEED_ENTRIES = 10;

export function useProctoring(
  active: boolean,
  attemptId: string | null,
  photoIntervalMinutes: number,
  capturePhoto: (kind: "start" | "periodic") => void
): UseProctoringResult {
  const [warnings, setWarnings] = useState<ProctoringWarnings>({ tabLost: false, fullscreenLost: false });
  const [recentEvents, setRecentEvents] = useState<ProctoringFeedEntry[]>([]);

  const logProctor = useCallback(
    (eventType: string) => {
      if (!attemptId) return;
      const meta = PROCTORING_EVENT_LABELS[eventType];
      const entry: ProctoringFeedEntry = {
        type: eventType,
        label: meta?.label ?? eventType,
        severity: meta?.severity ?? "info",
        at: new Date(),
      };
      setRecentEvents((prev) => [entry, ...prev].slice(0, MAX_FEED_ENTRIES));
      api(`/attempts/${attemptId}/proctor`, { method: "POST", json: { eventType } }).catch(() => {});
    },
    [attemptId]
  );

  const requestFullscreenRestore = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  // Main proctoring effect
  useEffect(() => {
    if (!active || !attemptId) return;

    // Enter fullscreen
    document.documentElement.requestFullscreen?.().catch(() => {});

    const onVisibilityChange = () => {
      if (document.hidden) {
        logProctor("tab_switch");
        setWarnings((w) => ({ ...w, tabLost: true }));
      } else {
        logProctor("focus_return");
        setWarnings((w) => ({ ...w, tabLost: false }));
      }
    };

    const onWindowBlur = () => {
      // Only fire focus_loss if doc is still visible (alt-tab without tab switch)
      if (!document.hidden) {
        logProctor("focus_loss");
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logProctor("fullscreen_exit");
        setWarnings((w) => ({ ...w, fullscreenLost: true }));
      } else {
        setWarnings((w) => ({ ...w, fullscreenLost: false }));
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctor("copy_attempt");
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logProctor("paste_attempt");
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      logProctor("context_menu");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [active, attemptId, logProctor]);

  // Periodic photo capture
  useEffect(() => {
    if (!active || !attemptId || photoIntervalMinutes <= 0) return;
    const intervalMs = photoIntervalMinutes * 60 * 1000;
    const t = setInterval(() => {
      capturePhoto("periodic");
    }, intervalMs);
    return () => clearInterval(t);
  }, [active, attemptId, photoIntervalMinutes, capturePhoto]);

  return { warnings, recentEvents, logProctor, requestFullscreenRestore };
}
