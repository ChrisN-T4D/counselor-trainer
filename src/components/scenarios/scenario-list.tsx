"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Scenario = {
  id: string;
  title: string;
  dsmCategory: string;
  presentingProblem: string;
  difficulty: string;
  objectives: string[];
};

export function ScenarioList({ scenarios }: { scenarios: Scenario[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startSession(scenarioId: string) {
    setLoadingId(scenarioId);
    setError(null);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Failed to start session");
      setLoadingId(null);
      return;
    }

    const data = (await response.json()) as { session: { id: string } };
    router.push(`/practice/${data.session.id}`);
  }

  return (
    <div className="space-y-4">
      {scenarios.map((scenario) => (
        <article
          key={scenario.id}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{scenario.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{scenario.dsmCategory}</p>
              <p className="mt-2 text-sm text-slate-700">{scenario.presentingProblem}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                Difficulty: {scenario.difficulty}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {scenario.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => startSession(scenario.id)}
              disabled={loadingId === scenario.id}
              className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loadingId === scenario.id ? "Starting..." : "Start session"}
            </button>
          </div>
        </article>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
