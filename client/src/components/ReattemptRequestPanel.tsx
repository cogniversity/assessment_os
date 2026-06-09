import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Button } from "./Layout";
import { RotateCcw } from "lucide-react";

interface ReattemptRequest {
  id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  managerNote: string | null;
  createdAt: string;
  reviewedBy?: { name: string } | null;
}

/** assessmentStatus: current assessment row — approved request is "used" once status is completed again */
export function ReattemptRequestPanel({
  assessmentId,
  assessmentStatus,
}: {
  assessmentId: string;
  assessmentStatus: string;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data: request } = useQuery({
    queryKey: ["reattempt-request", assessmentId],
    queryFn: () => api<ReattemptRequest | null>(`/reattempt-requests/assessments/${assessmentId}`),
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/reattempt-requests/assessments/${assessmentId}`, {
        method: "POST",
        json: { message: message.trim() || undefined },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reattempt-request", assessmentId] });
      qc.invalidateQueries({ queryKey: ["my-assessments"] });
      setShowForm(false);
      setMessage("");
    },
  });

  const approvalAlreadyUsed =
    request?.status === "approved" && assessmentStatus === "completed";

  if (request?.status === "pending") {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-3 mb-4 text-sm">
        <p className="font-medium text-amber-900 flex items-center gap-2">
          <RotateCcw size={16} /> Reattempt requested
        </p>
        <p className="text-amber-800 mt-1">
          Waiting for your capability manager to approve. You will see this assessment under Pending when approved.
        </p>
        {request.message && (
          <p className="text-amber-700 mt-2 text-xs">Your note: {request.message}</p>
        )}
      </div>
    );
  }

  if (request?.status === "approved" && !approvalAlreadyUsed) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg px-4 py-3 mb-4 text-sm">
        <p className="font-medium text-green-900">Reattempt approved</p>
        <p className="text-green-800 mt-1">
          Open this assessment from <strong>Pending</strong> on your dashboard and click Start.
        </p>
        {request.managerNote && (
          <p className="text-green-700 mt-2 text-xs">Manager: {request.managerNote}</p>
        )}
      </div>
    );
  }

  if (request?.status === "rejected") {
    return (
      <div className="border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 mb-4 text-sm">
        <p className="font-medium text-slate-800">Reattempt request declined</p>
        {request.managerNote && (
          <p className="text-slate-600 mt-1">{request.managerNote}</p>
        )}
        {!showForm ? (
          <Button variant="secondary" className="mt-3" onClick={() => setShowForm(true)}>
            Request again
          </Button>
        ) : (
          <ReattemptForm
            message={message}
            setMessage={setMessage}
            onSubmit={() => create.mutate()}
            pending={create.isPending}
            error={create.error as Error | null}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="border-t border-slate-200 pt-4 mt-4">
        {approvalAlreadyUsed && (
          <p className="text-xs text-slate-500 mb-2">
            Your previous reattempt was used. You can request another if needed.
          </p>
        )}
        <p className="text-sm text-slate-600 mb-3">
          Need another attempt? Request approval from your capability manager.
        </p>
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          <RotateCcw size={14} /> Request reattempt
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 pt-4 mt-4">
      <ReattemptForm
        message={message}
        setMessage={setMessage}
        onSubmit={() => create.mutate()}
        pending={create.isPending}
        error={create.error as Error | null}
        onCancel={() => setShowForm(false)}
      />
    </div>
  );
}

function ReattemptForm({
  message,
  setMessage,
  onSubmit,
  pending,
  error,
  onCancel,
}: {
  message: string;
  setMessage: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-600 block">
        Message to capability manager (optional)
      </label>
      <textarea
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. I was interrupted during the test and would like to try again."
      />
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? "Sending…" : "Submit request"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-red-600 text-sm">{error.message}</p>}
    </div>
  );
}
