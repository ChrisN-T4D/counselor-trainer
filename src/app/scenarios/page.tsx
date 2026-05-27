import { AppHeader } from "@/components/layout/app-header";
import { ScenarioList } from "@/components/scenarios/scenario-list";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const scenarios = await db.scenario.findMany({
    orderBy: { title: "asc" },
  });

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Training scenarios</h1>
          <p className="mt-1 text-slate-600">
            Choose a DSM-style case to begin a text-based practice session.
          </p>
        </div>
        <ScenarioList scenarios={scenarios} />
      </main>
    </>
  );
}
