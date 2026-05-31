import { AppHeader } from "@/components/layout/app-header";
import { AdminAnalyticsCards } from "@/components/admin/analytics-cards";
import { AdminLlmHealthPanel } from "@/components/admin/admin-llm-health-panel";
import {
  AdminQuickActions,
  ScenarioManagementTable,
} from "@/components/admin/scenario-management-table";
import { UserManagementTable } from "@/components/admin/user-management-table";
import { requireAdmin } from "@/lib/auth/require-role";
import { getAdminAnalytics, getAdminScenarios, getAdminUsers } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdmin();

  const [analytics, scenarios, users] = await Promise.all([
    getAdminAnalytics(),
    getAdminScenarios(),
    getAdminUsers(),
  ]);

  const usersForTable = users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
  }));

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Admin dashboard</h1>
          <p className="mt-1 text-slate-600">
            Manage users, roles, and the scenario catalog.
          </p>
        </div>

        <AdminQuickActions />

        <section className="mt-10 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Users & roles</h2>
            <p className="text-sm text-slate-600">
              Assign learner, supervisor, or admin access.
            </p>
          </div>
          <UserManagementTable users={usersForTable} currentUserId={session.user.id} />
        </section>

        <section className="mt-10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Scenario catalog</h2>
              <p className="text-sm text-slate-600">
                Review templates and generated scenarios. Deleting removes linked sessions and cases.
              </p>
            </div>
          </div>
          <ScenarioManagementTable scenarios={scenarios} />
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Platform analytics</h2>
          <AdminAnalyticsCards analytics={analytics} />
        </section>

        <AdminLlmHealthPanel />

        <p className="mt-8 text-xs text-slate-500">
          Signed in as {session.user.name} ({session.user.role})
        </p>
      </main>
    </>
  );
}
