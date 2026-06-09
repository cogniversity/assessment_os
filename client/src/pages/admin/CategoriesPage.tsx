import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { Card, Button, Input } from "../../components/Layout";

interface Category {
  id: string;
  name: string;
  description?: string;
  _count?: { topics: number };
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/admin/categories"),
  });
  const [form, setForm] = useState({ name: "", description: "" });
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const create = useMutation({
    mutationFn: () => api("/admin/categories", { method: "POST", json: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setForm({ name: "", description: "" });
      showToast("Category created");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">{toast}</div>
      )}
      <h1 className="text-2xl font-semibold">Categories</h1>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Categories</strong> are top-level groupings (e.g. "Programming", "Cloud &amp; DevOps", "Data Engineering"). Each <strong>Topic</strong> belongs to one category. When assigning assessments, managers can filter topics by category to quickly find what they need.
      </div>
      <Card title="Add category">
        <div className="grid md:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cloud & DevOps" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Description</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
          {create.isPending ? "Creating..." : "Create category"}
        </Button>
      </Card>
      <Card title={`Categories (${data?.length ?? 0})`}>
        {isLoading ? (
          <p className="text-slate-500">Loading...</p>
        ) : (
          <div className="divide-y">
            {data?.map((c) => (
              <div key={c.id} className="py-3 flex justify-between items-center">
                <div>
                  <span className="font-semibold">{c.name}</span>
                  {c.description && <span className="ml-2 text-slate-500 text-sm">— {c.description}</span>}
                  {c._count !== undefined && (
                    <span className="ml-3 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{c._count.topics} topic{c._count.topics !== 1 ? "s" : ""}</span>
                  )}
                </div>
                <Button variant="danger" onClick={() => remove.mutate(c.id)}>Delete</Button>
              </div>
            ))}
            {data?.length === 0 && <p className="text-slate-500 text-sm py-2">No categories yet.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
