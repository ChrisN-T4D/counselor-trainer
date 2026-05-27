export type BiopsychosocialWriteup = {
  identifyingSnapshot: string;
  presentingConcerns: string;
  biologicalFactors: string;
  psychologicalFactors: string;
  socialSystemicFactors: string;
  riskSafety: string;
  workingHypotheses: string;
  sessionGoals: string;
  interventionConsiderations: string;
};

export const BIOPSYCHOSOCIAL_SECTIONS: Array<{
  key: keyof BiopsychosocialWriteup;
  label: string;
}> = [
  { key: "identifyingSnapshot", label: "Identifying snapshot" },
  { key: "presentingConcerns", label: "Presenting concerns" },
  { key: "biologicalFactors", label: "Biological factors" },
  { key: "psychologicalFactors", label: "Psychological factors" },
  { key: "socialSystemicFactors", label: "Social/systemic factors" },
  { key: "riskSafety", label: "Risk and safety" },
  { key: "workingHypotheses", label: "Working hypotheses" },
  { key: "sessionGoals", label: "Session goals" },
  { key: "interventionConsiderations", label: "Intervention considerations" },
];

export function isBiopsychosocialWriteup(value: unknown): value is BiopsychosocialWriteup {
  if (!value || typeof value !== "object") {
    return false;
  }

  return BIOPSYCHOSOCIAL_SECTIONS.every(({ key }) => {
    const section = (value as Record<string, unknown>)[key];
    return typeof section === "string" && section.trim().length > 0;
  });
}
