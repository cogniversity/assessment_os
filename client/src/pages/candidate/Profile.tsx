import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiForm, downloadUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Layout, Card, Button, Input, Badge } from "../../components/Layout";
import { Save, Upload, CheckCircle2, FileText, AlertCircle, ExternalLink } from "lucide-react";

interface ExternalCertificate {
  id: string;
  title: string;
  issuer: string | null;
  filePath: string;
  verifiedByAdmin: boolean;
  createdAt: string;
}

export default function CandidateProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["profile-me"],
    queryFn: () =>
      api<{
        user: {
          profile: Record<string, unknown>;
          externalCertificates: ExternalCertificate[];
        };
        fieldDefs: { key: string; label: string; type: string }[];
        platformCertificates: { certNumber: string; proficiency: string }[];
      }>("/profile/me"),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const save = useMutation({
    mutationFn: () => api(`/profile/${user!.id}`, { method: "PATCH", json: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-me"] }),
  });

  const uploadCert = useMutation({
    mutationFn: (fd: FormData) =>
      apiForm<ExternalCertificate>(`/profile/${user!.id}/external-certificates`, fd),
    onSuccess: (cert) => {
      setUploadMessage({
        type: "success",
        text: `"${cert.title}" uploaded successfully. It appears in your list below.`,
      });
      setSelectedFile(null);
      formRef.current?.reset();
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["profile-me"] });
    },
    onError: (e) => {
      setUploadMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Upload failed. Please try again.",
      });
    },
  });

  if (isLoading || !data)
    return (
      <Layout nav={[{ to: "/dashboard", label: "Dashboard" }, { to: "/profile", label: "Profile" }]}>
        <p>Loading...</p>
      </Layout>
    );

  const p = data.user.profile as Record<string, unknown>;
  const externalCerts = [...(data.user.externalCertificates ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Layout nav={[{ to: "/dashboard", label: "Dashboard" }, { to: "/profile", label: "Profile" }]}>
      <h1 className="text-2xl font-semibold mb-6">My Profile</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Staffing details">
          {[
            ["country", "Country"],
            ["employeeId", "Employee ID"],
            ["employeeName", "Employee Name"],
            ["band", "Band"],
            ["subBand", "Sub Band"],
            ["reportingManagerCode", "Manager Code"],
            ["reportingManagerName", "Manager Name"],
            ["projectCode", "Project Code"],
            ["projectName", "Project Name"],
            ["allocationPercentage", "Allocation %"],
            ["status", "Status"],
          ].map(([key, label]) => (
            <div key={key} className="mb-2">
              <label className="text-xs text-slate-500">{label}</label>
              <Input
                defaultValue={String(p[key] ?? form[key] ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs text-slate-500 mt-2">FTE (computed): {String(p.fte ?? "—")}</p>
          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={16} />
              {save.isPending ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </Card>

        <Card title="Platform certificates" subtitle="Issued by Assessment OS when you pass an assessment.">
          <ul className="space-y-2 text-sm">
            {data.platformCertificates.map((c) => (
              <li key={c.certNumber} className="flex justify-between gap-2">
                <span>
                  {c.certNumber} — {c.proficiency}
                </span>
                <a
                  href={downloadUrl(`/certificates/${c.certNumber}/pdf`)}
                  className="text-indigo-600 hover:underline shrink-0 inline-flex items-center gap-1"
                >
                  <ExternalLink size={12} />
                  PDF
                </a>
              </li>
            ))}
            {data.platformCertificates.length === 0 && (
              <p className="text-slate-500">No platform certificates yet.</p>
            )}
          </ul>
        </Card>

        <Card
          title="External certificates"
          subtitle="Certificates you earned outside this platform (PDF or image)."
          className="lg:col-span-2"
        >
          {externalCerts.length > 0 ? (
            <ul className="space-y-2 mb-6">
              {externalCerts.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <FileText size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{c.title}</p>
                      {c.issuer && <p className="text-xs text-slate-500">{c.issuer}</p>}
                      <p className="text-xs text-slate-400">
                        Uploaded {new Date(c.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.verifiedByAdmin && <Badge color="green">Verified</Badge>}
                    <a
                      href={downloadUrl(`/profile/${user!.id}/external-certificates/${c.id}/file`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline inline-flex items-center gap-1 text-sm font-medium"
                    >
                      <ExternalLink size={12} />
                      View file
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 mb-6">No external certificates uploaded yet.</p>
          )}

          <div className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Add a certificate</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter the title and issuer, choose a PDF or image file, then click Upload certificate.
            </p>

            {uploadMessage && (
              <div
                className={`mb-4 flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                  uploadMessage.type === "success"
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
                role="status"
              >
                {uploadMessage.type === "success" ? (
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                )}
                <p>{uploadMessage.text}</p>
              </div>
            )}

            <form
              ref={formRef}
              className="space-y-4 max-w-lg"
              onSubmit={(e) => {
                e.preventDefault();
                setUploadMessage(null);
                if (!selectedFile) {
                  setUploadMessage({ type: "error", text: "Please choose a PDF or image file first." });
                  return;
                }
                const fd = new FormData(e.currentTarget);
                uploadCert.mutate(fd);
              }}
            >
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input name="title" placeholder="e.g. AWS Solutions Architect" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Issuer</label>
                <Input name="issuer" placeholder="e.g. Amazon Web Services" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Certificate file <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-400 transition-colors">
                    <Upload size={18} />
                    Choose file
                    <input
                      ref={fileInputRef}
                      type="file"
                      name="file"
                      accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                      required
                      className="sr-only"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0] ?? null;
                        setSelectedFile(f);
                        if (f) setUploadMessage(null);
                      }}
                    />
                  </label>
                  <div className="text-sm text-slate-600 min-w-0">
                    {selectedFile ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                        <FileText size={14} className="text-indigo-600 shrink-0" />
                        <span className="truncate">{selectedFile.name}</span>
                        <span className="text-slate-400 font-normal shrink-0">
                          ({(selectedFile.size / 1024).toFixed(0)} KB)
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">No file selected — PDF or image, max typical upload size</span>
                    )}
                  </div>
                </div>
              </div>
              <Button type="submit" variant="primary" disabled={uploadCert.isPending || !selectedFile}>
                <Upload size={16} />
                {uploadCert.isPending ? "Uploading…" : "Upload certificate"}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
