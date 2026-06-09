import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { Card, Button, Input, Select } from "../../components/Layout";

interface Topic {
  id: string;
  name: string;
  description?: string;
  passMark: number;
  issueCertificate: boolean;
  revealAnswersAfterTest: boolean;
  category: { id: string; name: string };
  _count?: { questions: number };
}

export default function TopicsPage() {
  const qc = useQueryClient();
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({
    categoryId: "",
    name: "",
    description: "",
    passMark: "60",
    issueCertificate: true,
    revealAnswersAfterTest: true,
    certValidityDays: "365",
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<{ id: string; name: string }[]>("/admin/categories") });
  const topics = useQuery({ queryKey: ["topics"], queryFn: () => api<Topic[]>("/admin/topics") });

  const create = useMutation({
    mutationFn: () =>
      api("/admin/topics", {
        method: "POST",
        json: {
          categoryId: form.categoryId,
          name: form.name,
          description: form.description,
          passMark: parseInt(form.passMark, 10),
          issueCertificate: form.issueCertificate,
          showProficiencyOnCert: true,
          certValidityDays: parseInt(form.certValidityDays, 10),
          revealAnswersAfterTest: form.revealAnswersAfterTest,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics"] });
      setForm({ ...form, name: "", description: "" });
      showToast("Topic created");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/topics/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["topics"] }),
  });

  // Group by category
  const byCategory: Record<string, Topic[]> = {};
  topics.data?.forEach((t) => {
    const k = t.category.name;
    (byCategory[k] = byCategory[k] || []).push(t);
  });

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">{toast}</div>
      )}
      <h1 className="text-2xl font-semibold">Topics</h1>
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
        <strong>Topics</strong> live inside a <strong>Category</strong> and hold the question bank. E.g. "JavaScript Basics" and "JavaScript Async" both sit in "Programming". When you assign an assessment you pick a topic and an experience level — the engine draws published questions from that topic's pool.
      </div>

      <Card title="Add topic">
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Category *</label>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Select category</option>
              {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Topic name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. JavaScript Basics" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Pass mark %</label>
            <Input type="number" value={form.passMark} onChange={(e) => setForm({ ...form, passMark: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Issue certificate on pass?</label>
            <Select value={form.issueCertificate ? "yes" : "no"} onChange={(e) => setForm({ ...form, issueCertificate: e.target.value === "yes" })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Reveal answers after test?</label>
            <Select value={form.revealAnswersAfterTest ? "yes" : "no"} onChange={(e) => setForm({ ...form, revealAnswersAfterTest: e.target.value === "yes" })}>
              <option value="yes">Yes — candidates see correct answers</option>
              <option value="no">No — score only</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Certificate validity (days, 0=forever)</label>
            <Input type="number" value={form.certValidityDays} onChange={(e) => setForm({ ...form, certValidityDays: e.target.value })} />
          </div>
        </div>
        <Button onClick={() => create.mutate()} disabled={!form.categoryId || !form.name || create.isPending}>
          {create.isPending ? "Creating..." : "Create topic"}
        </Button>
        {create.isError && <p className="text-red-600 text-xs mt-1">{(create.error as Error).message}</p>}
      </Card>

      {topics.isLoading ? (
        <p className="text-slate-500">Loading...</p>
      ) : (
        Object.entries(byCategory).map(([catName, ts]) => (
          <Card key={catName} title={`${catName} (${ts.length} topic${ts.length !== 1 ? "s" : ""})`}>
            <div className="divide-y">
              {ts.map((t) => (
                <div key={t.id} className="py-3 flex justify-between items-start">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Pass: {t.passMark}%</span>
                      {t.issueCertificate && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">🎓 Certificate</span>}
                      {t.revealAnswersAfterTest && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Reveals answers</span>}
                      {t._count !== undefined && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{t._count.questions} question{t._count.questions !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => remove.mutate(t.id)}>Delete</Button>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
      {!topics.isLoading && Object.keys(byCategory).length === 0 && (
        <Card><p className="text-slate-500 text-sm">No topics yet. Create a category first, then add topics.</p></Card>
      )}
    </div>
  );
}
