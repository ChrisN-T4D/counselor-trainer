"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatContextType } from "@/lib/scenarios/labels";
import type { ScenarioListItem } from "@/lib/scenarios/types";

type ScenarioRow = {
  id: string;
  title: string;
  contextType: ScenarioListItem["contextType"];
  dsmCategory: string;
  difficulty: string;
  acuityLevel: string;
  isTemplate: boolean;
  _count: { sessions: number; clientCases: number };
};

export function ScenarioManagementTable({ scenarios }: { scenarios: ScenarioRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deleteScenario(scenario: ScenarioRow) {
    const usageNote =
      scenario._count.sessions > 0 || scenario._count.clientCases > 0
        ? `\n\nThis will also remove ${scenario._count.sessions} session(s) and ${scenario._count.clientCases} client case(s).`
        : "";

    const confirmed = window.confirm(
      `Delete "${scenario.title}"? This cannot be undone.${usageNote}`,
    );

    if (!confirmed) {
      return;
    }

    setPendingId(scenario.id);
    setError(null);

    try {
      const response = await fetch(`/api/admin/scenarios/${scenario.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not delete scenario");
      }

      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete scenario");
    } finally {
      setPendingId(null);
    }
  }

  if (scenarios.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No scenarios in the catalog yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Context</th>
              <th className="px-4 py-3">Difficulty</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Usage</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr key={scenario.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{scenario.title}</p>
                  <p className="text-xs text-slate-500">{scenario.dsmCategory}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatContextType(scenario.contextType)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {scenario.difficulty} · {scenario.acuityLevel}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      scenario.isTemplate
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {scenario.isTemplate ? "Template" : "Generated"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {scenario._count.sessions} sessions · {scenario._count.clientCases} cases
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void deleteScenario(scenario)}
                    disabled={pendingId === scenario.id}
                    className="text-sm font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
                  >
                    {pendingId === scenario.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminQuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/scenarios"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
      >
        Open scenario generator
      </Link>
      <Link
        href="/supervisor"
        className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Open supervisor dashboard
      </Link>
    </div>
  );
}
