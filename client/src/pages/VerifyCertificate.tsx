import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "../components/Layout";

export default function VerifyCertificate() {
  const { certNumber } = useParams();
  const { data } = useQuery({
    queryKey: ["cert", certNumber],
    queryFn: () =>
      api<{
        certNumber: string;
        proficiency: string;
        issuedAt: string;
        expiresAt: string | null;
        expired: boolean;
        attempt: { assessment: { topic: { name: string }; user: { name: string } } };
      }>(`/certificates/${certNumber}`),
    enabled: !!certNumber,
  });

  if (!data) return <Card><p>Loading...</p></Card>;

  return (
    <Card title="Certificate verification">
      <p><strong>{data.attempt.assessment.user.name}</strong></p>
      <p>Topic: {data.attempt.assessment.topic.name}</p>
      <p>Proficiency: {data.proficiency}</p>
      <p>Issued: {new Date(data.issuedAt).toLocaleDateString()}</p>
      {data.expiresAt && <p>Expires: {new Date(data.expiresAt).toLocaleDateString()}</p>}
      {data.expired && <p className="text-red-600 font-medium">This certificate has expired.</p>}
      <p className="text-xs text-slate-500 mt-4">ID: {data.certNumber}</p>
    </Card>
  );
}
