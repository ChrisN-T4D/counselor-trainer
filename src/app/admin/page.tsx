import { AppHeader } from "@/components/layout/app-header";
import { AdminAnalyticsCards } from "@/components/admin/analytics-cards";
import {
  AdminQuickActions,
  ScenarioManagementTable,
} from "@/components/admin/scenario-management-table";
import { requireAdmin } from "@/lib/auth/require-role";
import { getAdminAnalytics, getAdminScenarios } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdmin();

  const [analytics, scenarios] = await Promise.all([
    getAdminAnalytics(),
    getAdminScenarios(),
  ]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Admin dashboard</h1>
          <p className="mt-1 text-slate-600">
            Platform overview, scenario catalog, and management entry points.
          </p>
        </div>

        <AdminQuickActions />

        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Platform analytics</h2>
          <AdminAnalyticsCards analytics={analytics} />
        </section>

        <section className="mt-10 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Scenario catalog</h2>
              <p className="text-sm text-slate-600">
                All scenarios and templates with usage counts.
              </p>
            </div>
          </div>
          <ScenarioManagementTable scenarios={scenarios} />
        </section>

        <section className="mt-10 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
          <h2 className="text-sm font-semibold text-slate-800">Coming soon</h2>
          <p className="mt-1 text-sm text-slate-600">
            User role management, audit logs, and scenario archival controls will live here.
          </p>
        </section>

        <p className="mt-8 text-xs text-slate-500">
          Signed in as {session.user.name} ({session.user.role})
        </p>
      </main>
    </>
  );
}
