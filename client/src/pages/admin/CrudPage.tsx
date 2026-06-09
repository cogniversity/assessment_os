import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, Button, Input } from "../../components/Layout";

export function CrudPage<T extends { id: string }>({
  title,
  endpoint,
  fields,
  renderRow,
}: {
  title: string;
  endpoint: string;
  fields: { key: string; label: string }[];
  renderRow?: (item: T) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: [endpoint], queryFn: () => api<T[]>(endpoint) });
  const [form, setForm] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () => api(endpoint, { method: "POST", json: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoint] });
      setForm({});
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${endpoint}/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [endpoint] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">{title}</h1>
      <Card title="Add new">
        <div className="grid gap-2 md:grid-cols-3 mb-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-slate-500">{f.label}</label>
              <Input value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button onClick={() => create.mutate()}>Create</Button>
      </Card>
      <Card title="List" >
        {isLoading ? <p>Loading...</p> : (
          <table className="w-full text-sm">
            <tbody>
              {data.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{renderRow ? renderRow(item) : JSON.stringify(item)}</td>
                  <td className="py-2 text-right">
                    <Button variant="danger" onClick={() => remove.mutate(item.id)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
