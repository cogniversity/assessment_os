import { PROFICIENCY_LABELS, PROFICIENCY_LEVELS } from "@assessment-os/shared";

const DEFAULT_THRESHOLDS = [40, 55, 70, 85, 95];

const SEGMENT_COLORS = [
  "bg-slate-200",
  "bg-slate-300",
  "bg-slate-400",
  "bg-indigo-300",
  "bg-indigo-500",
  "bg-indigo-800",
];

const SHORT_LABELS: Record<string, string> = {
  entry: "Entry",
  beginner: "Beginner",
  advanced_beginner: "Adv. Beg.",
  competent: "Competent",
  proficient: "Proficient",
  expert: "Expert",
};

type Props = {
  proficiency: string;
  score?: number | null;
  thresholds?: number[];
  className?: string;
};

export function ProficiencyMeter({ proficiency, score, thresholds = DEFAULT_THRESHOLDS, className = "" }: Props) {
  const bounds = [0, ...thresholds, 100];
  const levelIndex = PROFICIENCY_LEVELS.indexOf(proficiency as (typeof PROFICIENCY_LEVELS)[number]);
  const markerPct = score != null ? Math.min(100, Math.max(0, score)) : null;

  return (
    <div className={className}>
      <p className="text-xs font-medium text-slate-500 mb-2">Proficiency scale</p>
      <div className="relative h-7 rounded-md overflow-hidden flex ring-1 ring-slate-300">
        {PROFICIENCY_LEVELS.map((level, i) => {
          const start = bounds[i];
          const end = bounds[i + 1];
          const widthPct = end - start;
          const isActive = level === proficiency || i === levelIndex;
          return (
            <div
              key={level}
              className={`${SEGMENT_COLORS[i]} relative flex items-center justify-center ${isActive ? "ring-2 ring-amber-400 ring-inset z-10" : ""}`}
              style={{ width: `${widthPct}%` }}
              title={PROFICIENCY_LABELS[level]}
            >
              <span className="text-[9px] font-medium text-white/90 truncate px-0.5 hidden sm:inline">
                {SHORT_LABELS[level]}
              </span>
            </div>
          );
        })}
        {markerPct != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-20 pointer-events-none"
            style={{ left: `${markerPct}%`, transform: "translateX(-50%)" }}
            title={`Score: ${markerPct}%`}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400 border border-white shadow" />
          </div>
        )}
      </div>
      <div className="relative h-4 mt-0.5">
        {thresholds.map((t) => (
          <span
            key={t}
            className="absolute text-[9px] text-slate-400 -translate-x-1/2"
            style={{ left: `${t}%` }}
          >
            {t}%
          </span>
        ))}
      </div>
      <p className="text-sm text-slate-700 mt-2">
        Achieved: <strong>{PROFICIENCY_LABELS[proficiency] ?? proficiency}</strong>
        {score != null && <span className="text-slate-500"> ({score}%)</span>}
      </p>
    </div>
  );
}
