import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export interface AppIdSyncSummary {
  synced: { email: string; userId: string; role: string; created: boolean }[];
  skipped: { email: string; reason: string }[];
}

export function formatAppIdSyncMessage(summary: AppIdSyncSummary): string {
  const managers = summary.synced.filter((s) => s.role === "capability_manager").length;
  return `Synced ${summary.synced.length} user(s)${managers ? ` (${managers} capability manager${managers !== 1 ? "s" : ""})` : ""}${summary.skipped.length ? `; ${summary.skipped.length} skipped` : ""}.`;
}

export function useAppIdUserSync(opts?: {
  onSuccess?: (summary: AppIdSyncSummary) => void;
  onError?: (error: Error) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emails?: string[]) =>
      api<AppIdSyncSummary>("/admin/appid-users/sync", {
        method: "POST",
        json: emails?.length ? { emails } : {},
      }),
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["manager-skills"] });
      qc.invalidateQueries({ queryKey: ["manager-question-banks"] });
      qc.invalidateQueries({ queryKey: ["appid-users"] });
      opts?.onSuccess?.(summary);
    },
    onError: (e) => opts?.onError?.(e as Error),
  });
}
