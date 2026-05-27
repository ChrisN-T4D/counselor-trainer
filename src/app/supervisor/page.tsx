import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { CaseInsightsTable } from "@/components/supervisor/case-insights-table";
import { LearnerRosterTable } from "@/components/supervisor/learner-roster-table";
import { SessionMonitorTable } from "@/components/supervisor/session-monitor-table";
import { SupervisorAnalyticsCards } from "@/components/supervisor/analytics-cards";
import { requireSupervisor } from "@/lib/auth/require-role";
import {
  getCaseInsights,
  getLearnerRoster,
  getSessionMonitor,
  getSupervisorAnalytics,
} from "@/lib/supervisor/queries";

export const dynamic = "force-dynamic";

export default async function SupervisorDashboardPage() {
  const session = await requireSupervisor();

  const [analytics, learners, sessions, cases] = await Promise.all([
    getSupervisorAnalytics(),
    getLearnerRoster(),
    getSessionMonitor(),
    getCaseInsights(),
  ]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Supervisor dashboard</h1>
            <p className="mt-1 text-slate-600">
              Monitor learner progress, sessions, and client-case continuity.
            </p>
          </div>
          <Link
            href="/scenarios"
            className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Manage scenarios
          </Link>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Platform analytics</h2>
          <SupervisorAnalyticsCards analytics={analytics} />
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Learner roster</h2>
          <LearnerRosterTable learners={learners} />
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Session monitor</h2>
          <SessionMonitorTable sessions={sessions} />
        </section>

        <section className="mt-10 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Case insights</h2>
          <p className="text-sm text-slate-600">
            Relationship and safety trend snapshots from persistent client cases.
          </p>
          <CaseInsightsTable cases={cases} />
        </section>

        <p className="mt-8 text-xs text-slate-500">
          Signed in as {session.user.name} ({session.user.role})
        </p>
      </main>
    </>
  );
}
