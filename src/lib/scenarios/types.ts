export type ScenarioListItem = {
  id: string;
  title: string;
  contextType:
    | "MEDICAL_FAMILY_THERAPY"
    | "DOCTOR_HANDOFF"
    | "PEDIATRIC_PARENT_CHILD"
    | "INDIVIDUAL"
    | "COUPLES"
    | "FAMILY";
  dsmCategory: string;
  presentingProblem: string;
  objectives: string[];
  difficulty: string;
  ageGroup: string;
  acuityLevel: string;
  referralSource: string | null;
  sessionParticipants: string[];
  isTemplate: boolean;
};
