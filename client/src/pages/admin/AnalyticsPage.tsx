import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../api/client";
import { Card } from "../../components/Layout";

type PassRateRow = { passRate: number; attempts: number };
type RolePassRate = PassRateRow & { role: string; roleCode: string };
type BlueprintPassRate = PassRateRow & { blueprint: string };
type BlueprintSummary = PassRateRow & { blueprint: string; candidates: number; averageScore: number };
type ConceptTrend = {
  conceptCode: string;
  conceptName: string;
  skillCode: string;
  attempts: number;
  gapRate: number;
  strengthRate: number;
  avgAccuracy: number;
};

export default function AnalyticsPage() {
  const summary = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => api<Record<string, number>>("/analytics/summary"),
  });
  const passRates = useQuery({
    queryKey: ["pass-rates"],
    queryFn: () => api<{ topic: string; passRate: number }[]>("/analytics/pass-rates"),
  });
  const passRatesByRole = useQuery({
    queryKey: ["pass-rates-by-role"],
    queryFn: () => api<RolePassRate[]>("/analytics/pass-rates-by-role"),
  });
  const passRatesByBlueprint = useQuery({
    queryKey: ["pass-rates-by-blueprint"],
    queryFn: () => api<BlueprintPassRate[]>("/analytics/pass-rates-by-blueprint"),
  });
  const blueprintSummary = useQuery({
    queryKey: ["blueprint-summary"],
    queryFn: () => api<BlueprintSummary[]>("/analytics/blueprint-summary"),
  });
  const conceptTrends = useQuery({
    queryKey: ["concept-trends"],
    queryFn: () => api<ConceptTrend[]>("/analytics/concept-trends"),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Analytics</h1>
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {summary.data &&
          Object.entries(summary.data).map(([k, v]) => (
            <Card key={k}>
              <p className="text-xs text-slate-500">{k}</p>
              <p className="text-2xl font-semibold">{v}</p>
            </Card>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card title="Pass rate by topic">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={passRates.data || []}>
              <XAxis dataKey="topic" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="passRate" fill="#4f46e5" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Pass rate by skill role">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={passRatesByRole.data || []}>
              <XAxis dataKey="roleCode" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip
                formatter={(value) => [`${value ?? 0}%`, "Pass rate"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.role ?? ""}
              />
              <Bar dataKey="passRate" fill="#0d9488" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card title="Pass rate by blueprint">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={passRatesByBlueprint.data || []}>
              <XAxis dataKey="blueprint" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="passRate" fill="#7c3aed" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Blueprint summary">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">Blueprint</th>
                  <th className="py-2 pr-3 font-medium text-right">Attempts</th>
                  <th className="py-2 pr-3 font-medium text-right">Candidates</th>
                  <th className="py-2 pr-3 font-medium text-right">Avg score</th>
                  <th className="py-2 font-medium text-right">Pass %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(blueprintSummary.data ?? []).map((row) => (
                  <tr key={row.blueprint}>
                    <td className="py-2 pr-3 text-slate-800">{row.blueprint}</td>
                    <td className="py-2 pr-3 text-right text-slate-600">{row.attempts}</td>
                    <td className="py-2 pr-3 text-right text-slate-600">{row.candidates}</td>
                    <td className="py-2 pr-3 text-right text-slate-800 font-medium">{row.averageScore}%</td>
                    <td className="py-2 text-right text-slate-800 font-medium">{row.passRate}%</td>
                  </tr>
                ))}
                {(blueprintSummary.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No completed attempts yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Concept trends" subtitle="Aggregated from capability reports — higher gap % indicates more candidates weak on that concept">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-medium">Concept</th>
                <th className="py-2 pr-3 font-medium">Skill</th>
                <th className="py-2 pr-3 font-medium text-right">Attempts</th>
                <th className="py-2 pr-3 font-medium text-right">Avg accuracy</th>
                <th className="py-2 pr-3 font-medium text-right">Gap %</th>
                <th className="py-2 font-medium text-right">Strength %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(conceptTrends.data ?? []).map((row) => (
                <tr
                  key={`${row.skillCode}-${row.conceptCode}`}
                  className={row.gapRate >= 50 ? "bg-red-50/60" : undefined}
                >
                  <td className="py-2 pr-3">
                    <span className="font-medium text-slate-800">{row.conceptName}</span>
                    <span className="text-xs text-slate-400 ml-1">({row.conceptCode})</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600">{row.skillCode}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{row.attempts}</td>
                  <td className="py-2 pr-3 text-right text-slate-800">{row.avgAccuracy}%</td>
                  <td className="py-2 pr-3 text-right font-medium text-red-700">{row.gapRate}%</td>
                  <td className="py-2 text-right font-medium text-green-700">{row.strengthRate}%</td>
                </tr>
              ))}
              {(conceptTrends.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No capability reports yet — enable capability reports on blueprints/assignments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
