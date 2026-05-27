import Link from "next/link";
import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function formatHours(seconds: number) {
  const hours = seconds / 3600;
  return hours < 0.1 ? "< 0.1 hr" : `${hours.toFixed(1)} hr`;
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [totals, recentSessions] = await Promise.all([
    db.session.aggregate({
      where: { userId, status: "COMPLETED" },
      _sum: { practiceSeconds: true, reviewSeconds: true },
    }),
    db.session.findMany({
      where: { userId },
      include: { scenario: { select: { title: true, dsmCategory: true } } },
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  const practiceSeconds = totals._sum.practiceSeconds ?? 0;
  const reviewSeconds = totals._sum.reviewSeconds ?? 0;

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
          <h2 className="text-lg font-semibold text-slate-900">Recent sessions</h2>
          <Link
            href="/scenarios"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Start practice
          </Link>
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
                href={`/practice/${item.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-900">{item.scenario.title}</p>
                    <p className="text-sm text-slate-600">{item.scenario.dsmCategory}</p>
                  </div>
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {item.status}
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
