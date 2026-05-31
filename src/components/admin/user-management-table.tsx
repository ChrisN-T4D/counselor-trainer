"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@/generated/prisma/client";
import { ASSIGNABLE_ROLES, formatRole } from "@/lib/auth/role-labels";
import { formatDateTime } from "@/lib/format";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  _count: { sessions: number; clientCases: number };
};

export function UserManagementTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateRole(userId: string, role: Role) {
    setPendingId(userId);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not update role");
      }

      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update role");
    } finally {
      setPendingId(null);
    }
  }

  if (users.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No users registered yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Activity</th>
              <th className="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {user.name}
                    {user.id === currentUserId ? (
                      <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(user.createdAt)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {user._count.sessions} sessions · {user._count.clientCases} cases
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={pendingId === user.id}
                    onChange={(event) => void updateRole(user.id, event.target.value as Role)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                    aria-label={`Role for ${user.name}`}
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {formatRole(role)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Supervisors (Instructor role) can access the supervisor dashboard. Admins can manage users
        and scenarios.
      </p>
    </div>
  );
}
