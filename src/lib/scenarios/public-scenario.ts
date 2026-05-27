import { db } from "@/lib/db";
import type { ScenarioListItem } from "@/lib/scenarios/types";

export const PUBLIC_SCENARIO_SELECT = {
  id: true,
  title: true,
  contextType: true,
  dsmCategory: true,
  presentingProblem: true,
  objectives: true,
  difficulty: true,
  ageGroup: true,
  acuityLevel: true,
  referralSource: true,
  sessionParticipants: true,
  isTemplate: true,
} as const;

export function toScenarioListItem(
  scenario: {
    id: string;
    title: string;
    contextType: ScenarioListItem["contextType"];
    dsmCategory: string;
    presentingProblem: string;
    objectives: string[];
    difficulty: string;
    ageGroup: string;
    acuityLevel: string;
    referralSource: string | null;
    sessionParticipants: string[];
    isTemplate: boolean;
  },
): ScenarioListItem {
  return scenario;
}

export async function getPublicScenarios() {
  const scenarios = await db.scenario.findMany({
    select: PUBLIC_SCENARIO_SELECT,
    orderBy: { title: "asc" },
  });

  return scenarios.map(toScenarioListItem);
}

export function sanitizeScenarioForActiveSession<T extends { caseWriteup?: unknown }>(
  scenario: T,
) {
  const { caseWriteup: _caseWriteup, ...rest } = scenario;
  return rest;
}
