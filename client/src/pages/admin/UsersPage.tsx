import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { Card } from "../../components/Layout";
import { ROLE_LABELS, type Role } from "@assessment-os/shared";

const ALL_ROLES: Role[] = ["admin", "capability_manager", "candidate"];

type AppUser = { id: string; email: string; name: string; roles: Role[] };

export default function UsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: () => api<AppUser[]>("/admin/users"),
  });
  const updateRoles = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: Role[] }) =>
      api(`/admin/users/${id}/roles`, { method: "PATCH", json: { roles } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const toggleRole = (user: AppUser, role: Role) => {
    const has = user.roles.includes(role);
    const next = has ? user.roles.filter((r) => r !== role) : [...user.roles, role];
    if (next.length === 0) return;
    updateRoles.mutate({ id: user.id, roles: next });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Users</h1>
      <p className="text-sm text-slate-500 mb-4 max-w-2xl">
        Assessment OS accounts (created on first login, or provisioned from{" "}
        <Link to="/admin/appid-users" className="text-indigo-600 hover:underline">
          App ID Users
        </Link>
        ). Use <strong>Staffing profile</strong> to edit country, employee ID, and related fields for any user.
        App roles control access inside Assessment OS; users with multiple roles can switch in the header.
        IBM App ID roles are edited on the App ID Users page.
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
                <th>App roles</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="py-2">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <div className="flex flex-wrap gap-3">
                      {ALL_ROLES.map((role) => (
                        <label key={role} className="inline-flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={u.roles.includes(role)}
                            disabled={updateRoles.isPending}
                            onChange={() => toggleRole(u, role)}
                          />
                          {ROLE_LABELS[role]}
                        </label>
                      ))}
                    </div>
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
