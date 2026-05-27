"use client";

import { useMemo, useState } from "react";
import { ScenarioGeneratorForm } from "@/components/scenarios/scenario-generator-form";
import { ScenarioList } from "@/components/scenarios/scenario-list";
import type { ScenarioListItem } from "@/lib/scenarios/types";

const CONTEXT_LABELS: Record<ScenarioListItem["contextType"], string> = {
  MEDICAL_FAMILY_THERAPY: "Medical family therapy",
  DOCTOR_HANDOFF: "Doctor handoff",
  PEDIATRIC_PARENT_CHILD: "Pediatric parent-child",
  INDIVIDUAL: "Individual",
  COUPLES: "Couples",
  FAMILY: "Family",
};

type Props = {
  initialScenarios: ScenarioListItem[];
};

export function ScenariosPageClient({ initialScenarios }: Props) {
  const [scenarios, setScenarios] = useState(initialScenarios);
  const [contextFilter, setContextFilter] = useState<string>("all");

  const filteredScenarios = useMemo(() => {
    if (contextFilter === "all") {
      return scenarios;
    }
    return scenarios.filter((scenario) => scenario.contextType === contextFilter);
  }, [contextFilter, scenarios]);

  function handleGenerated(scenario: ScenarioListItem) {
    setScenarios((current) => [scenario, ...current]);
    setContextFilter("all");
  }

  return (
    <div className="space-y-6">
      <ScenarioGeneratorForm onGenerated={handleGenerated} />

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-700">
          Filter by context:
          <select
            value={contextFilter}
            onChange={(event) => setContextFilter(event.target.value)}
            className="ml-2 rounded-md border border-slate-300 px-3 py-1.5"
          >
            <option value="all">All contexts</option>
            {Object.entries(CONTEXT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-500">{filteredScenarios.length} scenario(s)</p>
      </div>

      <ScenarioList scenarios={filteredScenarios} />
    </div>
  );
}
