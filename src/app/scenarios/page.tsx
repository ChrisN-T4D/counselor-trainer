import { AppHeader } from "@/components/layout/app-header";
import { ScenariosPageClient } from "@/components/scenarios/scenarios-page-client";
import { getPublicScenarios } from "@/lib/scenarios/public-scenario";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const scenarios = await getPublicScenarios();

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Training scenarios</h1>
          <p className="mt-1 text-slate-600">
            Choose a counseling context and generate custom practice cases. Full
            biopsychosocial write-ups are revealed only after session completion.
          </p>
        </div>
        <ScenariosPageClient initialScenarios={scenarios} />
      </main>
    </>
  );
}
