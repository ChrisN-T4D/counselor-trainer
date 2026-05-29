import Link from "next/link";
import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { MyCasesPanel } from "@/components/dashboard/my-cases-panel";
import { canAccessAdmin, canAccessSupervisor } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [totals, recentSessions, clientCases, activeSessions] = await Promise.all([
    db.session.aggregate({
      where: { userId, status: "COMPLETED" },
      _sum: { practiceSeconds: true, reviewSeconds: true },
    }),
    db.session.findMany({
      where: { userId },
      include: {
        scenario: { select: { title: true, dsmCategory: true } },
        clientCase: { select: { id: true, displayName: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
    db.clientCase.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        scenario: {
          select: { title: true, contextType: true, dsmCategory: true },
        },
        sessions: {
          where: { status: "ACTIVE" },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    db.session.findMany({
      where: { userId, status: "ACTIVE" },
      select: { id: true, scenarioId: true, clientCaseId: true },
    }),
  ]);

  const practiceSeconds = totals._sum.practiceSeconds ?? 0;
  const reviewSeconds = totals._sum.reviewSeconds ?? 0;

  const myCases = clientCases.map((item) => ({
    id: item.id,
    displayName: item.displayName,
    status: item.status,
    sessionCount: item.sessionCount,
    lastSessionAt: item.lastSessionAt?.toISOString() ?? null,
    activeSessionId:
      item.sessions[0]?.id ??
      activeSessions.find((session) => session.clientCaseId === item.id)?.id ??
      activeSessions.find((session) => session.scenarioId === item.scenarioId)?.id ??
      null,
    scenario: item.scenario,
  }));

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">
            Welcome, {session?.user?.name}
          </h1>
          <p className="mt-1 text-slate-600">Track your practice and review progress.</p>
        </div>

        {(canAccessSupervisor(session?.user?.role) || canAccessAdmin(session?.user?.role)) && (
          <div className="mb-8 flex flex-wrap gap-3">
            {canAccessSupervisor(session?.user?.role) && (
              <Link
                href="/supervisor"
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-300"
              >
                <p className="font-medium text-slate-900">Supervisor dashboard</p>
                <p className="text-slate-600">Monitor learners, sessions, and cases</p>
              </Link>
            )}
            {canAccessAdmin(session?.user?.role) && (
              <Link
                href="/admin"
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-300"
              >
                <p className="font-medium text-slate-900">Admin dashboard</p>
                <p className="text-slate-600">Platform analytics and scenario catalog</p>
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Practice client hours</p>
            <p className="mt-2 text-3xl font-semibold">{formatHours(practiceSeconds)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">Review hours</p>
            <p className="mt-2 text-3xl font-semibold">{formatHours(reviewSeconds)}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">My cases</h2>
          <Link
            href="/scenarios"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            New scenario
          </Link>
        </div>
        <div className="mt-4">
          <MyCasesPanel initialCases={myCases} />
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900">Recent sessions</h2>
        </div>

        <div className="mt-4 space-y-3">
          {recentSessions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
              No sessions yet. Choose a scenario to begin your first practice session.
            </p>
          ) : (
            recentSessions.map((item) => (
              <Link
                key={item.id}
                href={
                  item.status === "COMPLETED"
                    ? `/review/${item.id}`
                    : `/practice/${item.id}`
                }
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">{item.scenario.title}</p>
                    <p className="text-sm text-slate-600">
                      {item.scenario.dsmCategory}
                      {item.sessionNumber > 1 ? ` · Session ${item.sessionNumber}` : ""}
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {item.status === "COMPLETED" ? "Review" : item.status}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>
    </>
  );
}
