import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Layout, Card, Button, Badge } from "../../components/Layout";
import { assessmentTopicLabel } from "../../utils/assessment";

interface Assessment {
  id: string;
  status: string;
  displayName?: string | null;
  topics?: { topic: { name: string } }[];
  skill: { name: string };
  attempts: {
    id: string;
    status: string;
    score: number | null;
    completedAt?: string | null;
    startedAt?: string;
  }[];
  passMark?: number;
  reattemptRequests?: { status: string }[];
}

function reattemptBadge(a: Assessment) {
  const req = a.reattemptRequests?.[0];
  if (!req) return null;
  if (req.status === "pending") return <Badge color="yellow">Reattempt pending</Badge>;
  if (req.status === "rejected") return <Badge color="slate">Reattempt declined</Badge>;
  return null;
}

export default function CandidateDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-assessments"],
    queryFn: () => api<Assessment[]>("/assessments/my"),
  });

  const pending =
    data?.filter(
      (a) =>
        a.status === "assigned" ||
        a.status === "in_progress" ||
        a.attempts.some((t) => t.status === "in_progress")
    ) ?? [];

  const history =
    data?.filter((a) => {
      if (a.status === "assigned" || a.status === "in_progress") return false;
      return (
        a.status === "completed" ||
        a.attempts.some((t) => t.status === "completed" || t.status === "timed_out")
      );
    }) ?? [];

  return (
    <Layout
      nav={[
        { to: "/dashboard", label: "Dashboard" },
        { to: "/profile", label: "Profile" },
      ]}
    >
      <h1 className="text-2xl font-semibold mb-6">My Assessments</h1>
      {isLoading && <p>Loading...</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Pending">
          <ul className="space-y-2">
            {pending.length === 0 && <p className="text-sm text-slate-500">No pending assessments</p>}
            {pending.map((a) => (
              <li key={a.id} className="flex justify-between items-center border-b pb-2 gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{assessmentTopicLabel(a)}</p>
                  <p className="text-xs text-slate-500">
                    {a.skill.name} · {a.status === "assigned" ? "Ready to start" : a.status}
                  </p>
                  {a.status === "assigned" &&
                    a.attempts.some((t) => t.status === "completed" || t.status === "timed_out") && (
                      <p className="text-xs text-green-600 mt-0.5">Reattempt approved</p>
                    )}
                </div>
                <Link to={`/assessment/${a.id}`} className="shrink-0">
                  <Button>
                    {a.attempts.some((t) => t.status === "in_progress") ? "Continue" : "Start"}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="History">
          <ul className="space-y-2">
            {history.length === 0 && <p className="text-sm text-slate-500">No completed assessments</p>}
            {history.map((a) => {
              const finished = a.attempts
                .filter((t) => t.status === "completed" || t.status === "timed_out")
                .sort((x, y) => {
                  const dx = x.completedAt ? new Date(x.completedAt).getTime() : 0;
                  const dy = y.completedAt ? new Date(y.completedAt).getTime() : 0;
                  return dy - dx;
                });
              const latest = finished[0];
              const passMark = a.passMark ?? 60;
              return (
                <li key={a.id} className="flex justify-between items-start border-b pb-3 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{assessmentTopicLabel(a)}</p>
                    <p className="text-xs text-slate-500 mb-1">
                      Latest: {latest?.score ?? "—"}%
                      {latest?.score != null && (
                        <span className={latest.score >= passMark ? " text-green-600" : " text-red-600"}>
                          {latest.score >= passMark ? " · Passed" : " · Did not pass"}
                        </span>
                      )}
                      {finished.length > 1 && ` · ${finished.length} attempts`}
                    </p>
                    {finished.length > 1 && (
                      <ul className="text-xs text-slate-500 space-y-0.5 ml-2 border-l-2 border-slate-200 pl-2">
                        {finished.map((t, i) => (
                          <li key={t.id}>
                            #{finished.length - i}: {t.score ?? "—"}%
                            {t.completedAt &&
                              ` · ${new Date(t.completedAt).toLocaleDateString()}`}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1">{reattemptBadge(a)}</div>
                  </div>
                  <Link to={`/assessment/${a.id}`} className="shrink-0">
                    <Button variant="secondary">Results</Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </Layout>
  );
}
