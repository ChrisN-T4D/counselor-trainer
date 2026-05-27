"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatContextType } from "@/lib/scenarios/labels";
import type { ScenarioListItem } from "@/lib/scenarios/types";

export function ScenarioList({ scenarios }: { scenarios: ScenarioListItem[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startSession(scenarioId: string) {
    setLoadingId(scenarioId);
    setError(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Failed to start session");
        return;
      }

      const data = (await response.json()) as { session: { id: string } };
      router.push(`/practice/${data.session.id}`);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {scenarios.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No scenarios match this filter yet. Generate one above to get started.
        </p>
      )}
      {scenarios.map((scenario) => (
        <article
          key={scenario.id}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{scenario.title}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {formatContextType(scenario.contextType)} · {scenario.dsmCategory}
              </p>
              <p className="mt-2 text-sm text-slate-700">{scenario.presentingProblem}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                Difficulty: {scenario.difficulty} · Acuity: {scenario.acuityLevel}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Participants: {scenario.sessionParticipants.join(", ")}
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
