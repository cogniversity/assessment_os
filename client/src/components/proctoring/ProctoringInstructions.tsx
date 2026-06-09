import { useState } from "react";
import { Camera, Monitor, ShieldAlert, Copy, MousePointerClick, Clock } from "lucide-react";
import { DEFAULT_PROCTORING_INSTRUCTIONS } from "@assessment-os/shared";

const ICONS = [Camera, Monitor, ShieldAlert, ShieldAlert, Monitor, Copy, Copy, ShieldAlert, ShieldAlert];

interface Props {
  assessmentName: string;
  customInstructions?: string | null;
  onAccept: () => void;
  loading?: boolean;
  error?: string;
  isReattempt?: boolean;
}

export function ProctoringInstructions({ assessmentName, customInstructions, onAccept, loading, error, isReattempt }: Props) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {isReattempt && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-3 mb-4 text-sm font-medium">
            Your manager approved a new attempt. A fresh session will begin when you start.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5">
            <div className="flex items-center gap-3 mb-1">
              <ShieldAlert size={22} className="text-indigo-200" />
              <p className="text-indigo-200 text-sm font-medium uppercase tracking-wide">Before you begin</p>
            </div>
            <h1 className="text-white text-xl font-bold">{assessmentName}</h1>
          </div>

          <div className="px-6 py-5">
            {/* Monitoring summary badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { icon: Camera, label: "Webcam photos", sub: "Start + periodic" },
                { icon: Monitor, label: "Fullscreen", sub: "Required throughout" },
                { icon: MousePointerClick, label: "Tab switching", sub: "Detected & logged" },
                { icon: Clock, label: "Activity log", sub: "All events recorded" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <Icon size={18} className="text-indigo-500" />
                  <p className="text-xs font-semibold text-slate-700">{label}</p>
                  <p className="text-[11px] text-slate-400">{sub}</p>
                </div>
              ))}
            </div>

            {/* Rules */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-slate-700 mb-3">Rules & requirements</p>
              <ul className="space-y-2">
                {DEFAULT_PROCTORING_INSTRUCTIONS.map((instruction, i) => {
                  const Icon = ICONS[i] ?? ShieldAlert;
                  return (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                        <Icon size={11} className="text-indigo-500" />
                      </span>
                      {instruction}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Custom instructions */}
            {customInstructions && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1.5">Additional requirements</p>
                <p className="text-sm text-amber-800 whitespace-pre-line">{customInstructions}</p>
              </div>
            )}

            {/* Consent checkbox */}
            <label className="flex items-start gap-3 cursor-pointer bg-indigo-50 border-2 border-indigo-200 rounded-xl px-4 py-3 mb-5 hover:bg-indigo-100 transition-colors">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0"
              />
              <span className="text-sm text-indigo-800 font-medium">
                I have read and understood the proctoring requirements. I consent to webcam photos being taken, my activity being monitored, and all proctoring events being recorded.
              </span>
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onAccept}
              disabled={!accepted || loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              {loading ? "Starting…" : "I agree — Start assessment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
