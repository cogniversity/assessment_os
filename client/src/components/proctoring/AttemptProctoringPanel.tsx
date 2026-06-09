import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PROCTORING_EVENT_LABELS } from "@assessment-os/shared";
import { Camera, AlertTriangle, Copy, Monitor, Eye, Info } from "lucide-react";
import { Badge } from "../Layout";

interface ProctoringEvent {
  id: string;
  eventType: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

interface Photo {
  id: string;
  filePath: string;
  kind: "start" | "periodic";
  capturedAt: string;
}

interface AttemptDetail {
  proctoringEvents: ProctoringEvent[];
  photos: Photo[];
}

const eventIcon: Record<string, React.ReactNode> = {
  tab_switch:      <Monitor size={14} className="text-red-500" />,
  focus_loss:      <Eye size={14} className="text-amber-500" />,
  focus_return:    <Eye size={14} className="text-slate-400" />,
  fullscreen_exit: <Monitor size={14} className="text-red-500" />,
  copy_attempt:    <Copy size={14} className="text-amber-500" />,
  paste_attempt:   <Copy size={14} className="text-amber-500" />,
  context_menu:    <Copy size={14} className="text-amber-500" />,
};

const severityColor: Record<string, string> = {
  critical: "red",
  warn: "yellow",
  info: "slate",
};

function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  const bg = color === "red" ? "bg-red-50 text-red-600" : color === "yellow" ? "bg-yellow-50 text-yellow-600" : "bg-slate-50 text-slate-500";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>{icon}</div>
      <div>
        <p className="text-xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

interface Props {
  attemptId: string;
}

export function AttemptProctoringPanel({ attemptId }: Props) {
  const { data, isLoading, isError } = useQuery<AttemptDetail>({
    queryKey: ["attempt-detail", attemptId],
    queryFn: () => api(`/attempts/${attemptId}`),
  });

  if (isLoading) return <p className="text-sm text-slate-400 py-8 text-center">Loading proctoring data…</p>;
  if (isError || !data) return <p className="text-sm text-red-500 py-8 text-center">Failed to load proctoring data.</p>;

  const events = data.proctoringEvents ?? [];
  const photos = data.photos ?? [];

  const tabSwitches   = events.filter((e) => e.eventType === "tab_switch").length;
  const copyAttempts  = events.filter((e) => e.eventType === "copy_attempt" || e.eventType === "paste_attempt" || e.eventType === "context_menu").length;

  // Merge events + photos into a unified timeline
  type TimelineItem =
    | { kind: "event"; data: ProctoringEvent; at: Date }
    | { kind: "photo"; data: Photo; at: Date };

  const timeline: TimelineItem[] = [
    ...events.map((e) => ({ kind: "event" as const, data: e, at: new Date(e.occurredAt) })),
    ...photos.map((p) => ({ kind: "photo" as const, data: p, at: new Date(p.capturedAt) })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total events" value={events.length} icon={<AlertTriangle size={18} />} color="slate" />
        <SummaryCard label="Tab switches" value={tabSwitches} icon={<Monitor size={18} />} color={tabSwitches > 0 ? "red" : "slate"} />
        <SummaryCard label="Copy/paste/menu" value={copyAttempts} icon={<Copy size={18} />} color={copyAttempts > 0 ? "yellow" : "slate"} />
        <SummaryCard label="Photos captured" value={photos.length} icon={<Camera size={18} />} color="slate" />
      </div>

      {events.length === 0 && photos.length === 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          <Info size={15} />
          No proctoring events recorded — clean session.
        </div>
      )}

      {/* Photos gallery */}
      {photos.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">Photos ({photos.length})</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square group">
                <img
                  src={`/api/photos/${p.filePath}`}
                  alt={`${p.kind} photo`}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                  <p className="text-[10px] text-white font-semibold capitalize">{p.kind}</p>
                  <p className="text-[10px] text-slate-300">{new Date(p.capturedAt).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">Timeline</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {timeline.map((item) => {
              if (item.kind === "photo") {
                return (
                  <div key={`photo-${item.data.id}`} className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50/40">
                    <Camera size={14} className="text-indigo-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-700 font-medium capitalize">{item.data.kind} photo captured</span>
                    </div>
                    <Badge color="indigo">{item.data.kind}</Badge>
                    <span className="text-xs text-slate-400 shrink-0">{item.at.toLocaleTimeString()}</span>
                  </div>
                );
              }
              const event = item.data;
              const meta = PROCTORING_EVENT_LABELS[event.eventType];
              const sev = meta?.severity ?? "info";
              return (
                <div key={`ev-${event.id}`} className={`flex items-center gap-3 px-4 py-2.5 ${sev === "critical" ? "bg-red-50/40" : sev === "warn" ? "bg-amber-50/30" : ""}`}>
                  <span className="shrink-0">{eventIcon[event.eventType] ?? <AlertTriangle size={14} />}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-700">{meta?.label ?? event.eventType}</span>
                  </div>
                  <Badge color={severityColor[sev] as "red" | "yellow" | "slate"}>{event.eventType}</Badge>
                  <span className="text-xs text-slate-400 shrink-0">{item.at.toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
