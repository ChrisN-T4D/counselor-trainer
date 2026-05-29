import { AppHeader } from "@/components/layout/app-header";
import { AdminAnalyticsCards } from "@/components/admin/analytics-cards";
import {
  AdminQuickActions,
  ScenarioManagementTable,
} from "@/components/admin/scenario-management-table";
import { requireAdmin } from "@/lib/auth/require-role";
import { getAdminAnalytics, getAdminScenarios } from "@/lib/admin/queries";
import { checkLlmHealth } from "@/lib/llm/health";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await requireAdmin();

  const [analytics, scenarios, llmHealth] = await Promise.all([
    getAdminAnalytics(),
    getAdminScenarios(),
    checkLlmHealth(),
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

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">LLM connectivity</h2>
          <p className="mt-1 text-sm text-slate-600">
            Live check against your configured Ollama/API host from this server.
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className={llmHealth.ok ? "font-medium text-green-700" : "font-medium text-red-700"}>
                {llmHealth.ok ? "Connected" : "Failed"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Model</dt>
              <dd className="font-medium text-slate-900">{llmHealth.model ?? "unset"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Host</dt>
              <dd className="font-medium text-slate-900">{llmHealth.baseUrl ?? "unset"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Latency</dt>
              <dd className="font-medium text-slate-900">
                {llmHealth.latencyMs != null ? `${llmHealth.latencyMs} ms` : "—"}
              </dd>
            </div>
          </dl>
          {llmHealth.replyPreview && (
            <p className="mt-3 text-sm text-slate-700">
              Test reply: <span className="font-medium">{llmHealth.replyPreview}</span>
            </p>
          )}
          {llmHealth.error && (
            <p className="mt-3 text-sm text-red-600">{llmHealth.error}</p>
          )}
          {llmHealth.hint && (
            <p className="mt-2 text-sm text-amber-700">{llmHealth.hint}</p>
          )}
        </section>

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
