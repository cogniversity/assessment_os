import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card, Select } from "../../components/Layout";

export default function UsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ id: string; email: string; name: string; role: string }[]>("/admin/users"),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api(`/admin/users/${id}/role`, { method: "PATCH", json: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Users</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">
        Assessment OS accounts (created on first login, or provisioned from{" "}
        <Link to="/admin/appid-users" className="text-indigo-600 hover:underline">
          App ID Users
        </Link>
        ). Use <strong>Staffing profile</strong> to edit country, employee ID, and related fields for any user.
        App role here controls access inside Assessment OS; IBM App ID roles are edited on the App ID Users page.
      </p>
      <Card>
        {!data?.length ? (
          <p className="text-sm text-slate-500 py-4">
            No users in the app database yet. Users appear after they sign in once, or when you use{" "}
            <strong>Sync to app</strong> on{" "}
            <Link to="/admin/appid-users" className="text-indigo-600 hover:underline">
              App ID Users
            </Link>
            .
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Name</th>
                <th>Email</th>
                <th>App role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <Select
                      value={u.role}
                      onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value })}
                    >
                      <option value="candidate">candidate</option>
                      <option value="capability_manager">capability_manager</option>
                      <option value="admin">admin</option>
                    </Select>
                  </td>
                  <td className="py-2 text-right">
                    <Link
                      to={`/admin/candidates/${u.id}`}
                      className="text-indigo-600 hover:underline text-sm"
                    >
                      Staffing profile
                    </Link>
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
