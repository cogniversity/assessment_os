import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, Button, Badge } from "../../components/Layout";
import { assessmentTopicLabel } from "../../utils/assessment";
import { Check, X } from "lucide-react";

interface ReattemptRequest {
  id: string;
  status: string;
  message: string | null;
  managerNote: string | null;
  createdAt: string;
  candidate: { name: string; email: string };
  assessment: {
    displayName?: string | null;
    topics?: { topic: { name: string } }[];
    skill: { name: string };
    attempts: { score: number | null }[];
  };
}

export default function ReattemptRequestsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["reattempt-requests", tab],
    queryFn: () => api<ReattemptRequest[]>(`/reattempt-requests/manager?status=${tab}`),
  });

  const review = useMutation({
    mutationFn: ({
      id,
      action,
      managerNote,
    }: {
      id: string;
      action: "approve" | "reject";
      managerNote?: string;
    }) =>
      api(`/reattempt-requests/manager/${id}`, {
        method: "PATCH",
        json: { action, managerNote },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reattempt-requests"] });
      qc.invalidateQueries({ queryKey: ["my-assessments"] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reattempt requests</h1>
      <p className="text-sm text-slate-500 max-w-2xl">
        Candidates request another attempt after finishing an assessment. Approving reopens the assignment so they can start again.
        Capability managers only see requests for assessments they assigned; admins see all requests.
      </p>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
              tab === s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : !data?.length ? (
          <p className="text-sm text-slate-500">No {tab} requests.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((r) => {
              const lastScore = r.assessment.attempts[0]?.score;
              return (
                <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium text-slate-800">
                        {r.candidate.name}{" "}
                        <span className="text-slate-500 font-normal text-sm">({r.candidate.email})</span>
                      </p>
                      <p className="text-sm text-slate-600">
                        {assessmentTopicLabel(r.assessment)} · {r.assessment.skill.name}
                        {lastScore != null && ` · last score ${lastScore}%`}
                      </p>
                    </div>
                    <Badge color={r.status === "pending" ? "yellow" : r.status === "approved" ? "green" : "slate"}>
                      {r.status}
                    </Badge>
                  </div>
                  {r.message && (
                    <p className="text-sm text-slate-600 mb-2 bg-slate-50 rounded-lg px-3 py-2">
                      <span className="font-medium">Candidate: </span>
                      {r.message}
                    </p>
                  )}
                  {r.managerNote && tab !== "pending" && (
                    <p className="text-sm text-slate-500 mb-2">Note: {r.managerNote}</p>
                  )}
                  <p className="text-xs text-slate-400 mb-3">
                    Requested {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {tab === "pending" && (
                    <div className="space-y-2">
                      <textarea
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Optional note to candidate"
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          disabled={review.isPending}
                          onClick={() =>
                            review.mutate({
                              id: r.id,
                              action: "approve",
                              managerNote: notes[r.id],
                            })
                          }
                        >
                          <Check size={14} /> Approve reattempt
                        </Button>
                        <Button
                          variant="danger"
                          disabled={review.isPending}
                          onClick={() =>
                            review.mutate({
                              id: r.id,
                              action: "reject",
                              managerNote: notes[r.id],
                            })
                          }
                        >
                          <X size={14} /> Reject
                        </Button>
                      </div>
                      {review.isError && (
                        <p className="text-red-600 text-sm">{(review.error as Error).message}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
