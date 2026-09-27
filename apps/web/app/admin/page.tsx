"use client";

import { useEffect, useState } from "react";
import type { AdminRole, Role } from "@insurance/shared";
import { useAuth } from "../../lib/auth-context";
import { apiFetch, ApiError } from "../../lib/api";

interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  adminRole: AdminRole | null;
  isActive: boolean;
  createdAt: string;
}

interface UsersListResponse {
  total: number;
  page: number;
  pageSize: number;
  users: AdminUserRow[];
}

export default function AdminUsersPage() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<UsersListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<UsersListResponse>("/api/admin/users", { accessToken })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users"));
  }, [accessToken]);

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-semibold">User management</h1>
      <p className="mt-2 text-sm text-gray-600">
        Full user/agent/plan/application management arrives in Phase 5. This table calls the
        <code> ADMIN</code>-only <code>GET /api/admin/users</code> endpoint to prove RBAC end to end.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {data && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-2">
                  {u.firstName} {u.lastName}
                </td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.adminRole ? `${u.role} (${u.adminRole})` : u.role}</td>
                <td className="py-2">{u.isActive ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
