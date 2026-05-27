import Link from "next/link";
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
  if (scenarios.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No scenarios in the catalog yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Context</th>
            <th className="px-4 py-3">Difficulty</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Usage</th>
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
            </tr>
          ))}
        </tbody>
      </table>
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
