import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "../components/Layout";
import { ProficiencyMeter } from "../components/ProficiencyMeter";

export default function VerifyCertificate() {
  const { certNumber } = useParams();
  const { data } = useQuery({
    queryKey: ["cert", certNumber],
    queryFn: () =>
      api<{
        certNumber: string;
        proficiency: string;
        score: number | null;
        proficiencyThresholds: number[];
        assessmentLabel: string;
        issuedAt: string;
        expiresAt: string | null;
        expired: boolean;
        attempt: { assessment: { user: { name: string } } };
      }>(`/certificates/${certNumber}`),
    enabled: !!certNumber,
  });

  if (!data) return <Card><p>Loading...</p></Card>;

  return (
    <Card title="Certificate verification">
      <p><strong>{data.attempt.assessment.user.name}</strong></p>
      <p>Assessment: {data.assessmentLabel}</p>
      <ProficiencyMeter
        className="my-4 max-w-lg"
        proficiency={data.proficiency}
        score={data.score}
        thresholds={data.proficiencyThresholds}
      />
      <p>Issued: {new Date(data.issuedAt).toLocaleDateString()}</p>
      {data.expiresAt && <p>Expires: {new Date(data.expiresAt).toLocaleDateString()}</p>}
      {data.expired && <p className="text-red-600 font-medium">This certificate has expired.</p>}
      <p className="text-xs text-slate-500 mt-4">ID: {data.certNumber}</p>
    </Card>
  );
}
