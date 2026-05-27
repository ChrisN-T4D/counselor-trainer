import type { ScenarioListItem } from "@/lib/scenarios/types";

export const CONTEXT_LABELS: Record<ScenarioListItem["contextType"], string> = {
  MEDICAL_FAMILY_THERAPY: "Medical family therapy",
  DOCTOR_HANDOFF: "Doctor handoff",
  PEDIATRIC_PARENT_CHILD: "Pediatric parent-child",
  INDIVIDUAL: "Individual",
  COUPLES: "Couples",
  FAMILY: "Family",
};

export function formatContextType(contextType: ScenarioListItem["contextType"]) {
  return CONTEXT_LABELS[contextType] ?? contextType;
}
