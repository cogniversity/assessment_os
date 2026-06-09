import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiForm, downloadUrl } from "../../api/client";
import { Card, Button } from "../../components/Layout";

export default function ImportPage() {
  const [result, setResult] = useState<{ imported?: number; errors?: { row: number; reason: string }[] } | null>(null);

  const commit = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiForm<{ imported: number }>("/admin/question-import/commit", fd);
    },
    onSuccess: setResult,
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Question import</h1>
      <Card>
        <a href={downloadUrl("/question-import/template.xlsx")} className="inline-block mb-4">
          <Button variant="secondary">Download template</Button>
        </a>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) commit.mutate(f);
          }}
          className="block text-sm"
        />
        {result && (
          <p className="mt-4 text-sm">
            Imported: {result.imported} rows
          </p>
        )}
      </Card>
    </div>
  );
}
