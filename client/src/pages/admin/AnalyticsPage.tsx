import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../api/client";
import { Card } from "../../components/Layout";

export default function AnalyticsPage() {
  const summary = useQuery({ queryKey: ["analytics-summary"], queryFn: () => api<Record<string, number>>("/analytics/summary") });
  const passRates = useQuery({ queryKey: ["pass-rates"], queryFn: () => api<{ topic: string; passRate: number }[]>("/analytics/pass-rates") });

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
      <Card title="Pass rate by topic">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={passRates.data || []}>
            <XAxis dataKey="topic" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="passRate" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
