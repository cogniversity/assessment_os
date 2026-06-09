import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Card } from "../../components/Layout";

export default function CandidatesPage() {
  const { data } = useQuery({
    queryKey: ["manager-candidates"],
    queryFn: () => api<{ id: string; name: string; email: string; profile?: { employeeId?: string } }[]>("/manager/candidates"),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Candidates</h1>
      <Card>
        <ul className="text-sm space-y-2">
          {data?.map((c) => (
            <li key={c.id}>
              <Link to={`/manager/candidates/${c.id}`} className="text-indigo-600 hover:underline">
                {c.name} ({c.email}) {c.profile?.employeeId && `· ${c.profile.employeeId}`}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
