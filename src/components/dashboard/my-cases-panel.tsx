"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatContextType } from "@/lib/scenarios/labels";
import type { ScenarioListItem } from "@/lib/scenarios/types";

type ClientCaseItem = {
  id: string;
  displayName: string;
  status: string;
  sessionCount: number;
  lastSessionAt: string | null;
  activeSessionId: string | null;
  scenario: {
    title: string;
    contextType: ScenarioListItem["contextType"];
    dsmCategory: string;
  };
};

export function MyCasesPanel({ initialCases }: { initialCases: ClientCaseItem[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function continueCase(clientCase: ClientCaseItem) {
    if (clientCase.activeSessionId) {
      router.push(`/practice/${clientCase.activeSessionId}`);
      return;
    }

    setLoadingId(clientCase.id);
    setError(null);

    try {
      const response = await fetch(`/api/client-cases/${clientCase.id}`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Failed to start next session");
        return;
      }

      const payload = (await response.json()) as { session: { id: string } };
      router.push(`/practice/${payload.session.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoadingId(null);
    }
  }

  if (initialCases.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No active client cases yet. Start a scenario to open a case that persists across sessions.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {initialCases.map((clientCase) => (
        <article
          key={clientCase.id}
          className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium text-slate-900">{clientCase.displayName}</p>
            <p className="text-sm text-slate-600">
              {formatContextType(clientCase.scenario.contextType)} ·{" "}
              {clientCase.scenario.dsmCategory}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {clientCase.sessionCount} session{clientCase.sessionCount === 1 ? "" : "s"} on this
              case
              {clientCase.activeSessionId ? " · active session in progress" : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {clientCase.activeSessionId ? (
              <Link
                href={`/practice/${clientCase.activeSessionId}`}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                Resume session
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => continueCase(clientCase)}
                disabled={loadingId === clientCase.id}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {loadingId === clientCase.id ? "Starting..." : "Continue case"}
              </button>
            )}
          </div>
        </article>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
