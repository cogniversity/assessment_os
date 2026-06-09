import { AlertTriangle, Maximize2, Eye, Clock } from "lucide-react";
import type { ProctoringFeedEntry, ProctoringWarnings } from "./useProctoring";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  warnings: ProctoringWarnings;
  recentEvents: ProctoringFeedEntry[];
  onRestoreFullscreen: () => void;
}

const severityStyle: Record<string, string> = {
  critical: "text-red-600",
  warn: "text-amber-500",
  info: "text-slate-400",
};

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ProctoringHud({ videoRef, warnings, recentEvents, onRestoreFullscreen }: Props) {
  const hasWarning = warnings.tabLost || warnings.fullscreenLost;

  return (
    <>
      {/* Fullscreen warning banner */}
      {warnings.fullscreenLost && !warnings.tabLost && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={16} />
            You exited fullscreen mode. Please return to fullscreen to continue.
          </div>
          <button
            type="button"
            onClick={onRestoreFullscreen}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-sm font-medium transition-colors"
          >
            <Maximize2 size={14} />
            Return to fullscreen
          </button>
        </div>
      )}

      {/* Tab-switch warning banner */}
      {warnings.tabLost && (
        <div className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white px-4 py-2.5 flex items-center gap-2 shadow-lg">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="text-sm font-semibold">
            Tab switch detected — this has been logged. Please stay on this tab for the duration of the test.
          </span>
        </div>
      )}

      {/* Camera PIP — bottom right */}
      <div className={`fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 ${hasWarning ? "bottom-16" : ""}`}>
        {/* Camera feed */}
        <div className="bg-slate-900 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-xl w-36 sm:w-44">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-28 sm:h-32 object-cover scale-x-[-1]"
          />
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-900">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">Monitoring active</span>
          </div>
        </div>

        {/* Activity feed */}
        {recentEvents.length > 0 && (
          <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-xl w-56 sm:w-64 shadow-xl overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-700">
              <Eye size={12} className="text-slate-400" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Activity log</span>
            </div>
            <ul className="max-h-36 overflow-y-auto divide-y divide-slate-800">
              {recentEvents.map((e, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-1.5">
                  <Clock size={10} className="text-slate-500 mt-1 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-medium truncate ${severityStyle[e.severity]}`}>{e.label}</p>
                    <p className="text-[10px] text-slate-500">{formatTime(e.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
