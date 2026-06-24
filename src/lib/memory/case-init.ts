import { z } from "zod";
import type { Scenario } from "@/generated/prisma/client";
import {
  BIOPSYCHOSOCIAL_SECTIONS,
  isBiopsychosocialWriteup,
  type BiopsychosocialWriteup,
} from "@/lib/scenarios/case-writeup";
import {
  applyRelationshipDelta,
  relationshipStateSchema,
  type RelationshipState,
} from "@/lib/memory/relationship-state";
import {
  applySafetyDelta,
  deriveEscalationRisk,
  riskLevelSchema,
  safetyStateSchema,
  type RiskLevel,
  type SafetyState,
} from "@/lib/memory/safety-state";
import {
  DEFAULT_EXPRESSIVITY_PROFILE,
  deriveProfile,
  expressivityProfileSchema,
  type ExpressivityProfile,
} from "@/lib/affect/expressivity-profile";
import {
  emotionStateSchema,
  initialEmotionState,
  type ClientEmotionState,
} from "@/lib/affect/emotion-state";

export const therapyGoalProgressSchema = z.object({
  objective: z.string(),
  progress: z.number().min(0).max(100),
});

export type TherapyGoalProgress = z.infer<typeof therapyGoalProgressSchema>;

type GenerationSettings = {
  clientResistance?: number;
  symptomSeverity?: number;
  sessionUrgency?: number;
};

function readGenerationSettings(scenario: Scenario): GenerationSettings {
  if (!scenario.generationSettings || typeof scenario.generationSettings !== "object") {
    return {};
  }
  return scenario.generationSettings as GenerationSettings;
}

function inferSiLevel(riskText: string): RiskLevel {
  const lower = riskText.toLowerCase();
  if (lower.includes("intent") || lower.includes("plan") || lower.includes("means")) {
    return "ACTIVE_WITH_PLAN";
  }
  if (lower.includes("passive") || lower.includes("hopeless")) {
    return "PASSIVE";
  }
  if (lower.includes("suicid") || lower.includes("si ")) {
    return "PASSIVE";
  }
  return "NONE";
}

function inferSubstanceSeverity(riskText: string, psychText: string): number {
  const text = `${riskText} ${psychText}`.toLowerCase();
  if (text.includes("substance") || text.includes("alcohol") || text.includes("drug")) {
    return 45;
  }
  return 10;
}

export function initializeRelationshipState(scenario: Scenario): RelationshipState {
  const settings = readGenerationSettings(scenario);
  const resistance = settings.clientResistance ?? 2;
  const severity = settings.symptomSeverity ?? 3;
  const urgency = settings.sessionUrgency ?? 3;

  const trust = Math.max(20, 55 - resistance * 8);
  const openness = Math.max(15, 50 - resistance * 7 - severity * 2);
  const dropoutRisk = Math.min(85, 25 + resistance * 8 + urgency * 4);

  return relationshipStateSchema.parse({
    trust,
    openness,
    alliance: Math.max(15, trust - 5),
    resistance: Math.min(90, 20 + resistance * 12),
    deception: Math.min(80, 15 + resistance * 10),
    emotionalRegulation: Math.max(20, 60 - severity * 8),
    goalProgress: 10,
    dropoutRisk,
    returnLikelihood: 100 - dropoutRisk,
    ruptureActive: false,
    repairAttempts: 0,
    clientPerceptionOfTherapist: "Uncertain — still deciding if this is safe.",
    unresolvedConcerns: [],
    recentTriggers: [],
  });
}

export function initializeSafetyState(
  scenario: Scenario,
  writeup?: BiopsychosocialWriteup | null,
): SafetyState {
  const settings = readGenerationSettings(scenario);
  const severity = settings.symptomSeverity ?? 3;
  const urgency = settings.sessionUrgency ?? 3;

  const riskText = writeup?.riskSafety ?? scenario.presentingProblem;
  const psychText = writeup?.psychologicalFactors ?? "";
  const siLevel = inferSiLevel(riskText);
  const substanceSeverity = inferSubstanceSeverity(riskText, psychText);

  const base = {
    siLevel,
    siFrequency: siLevel === "NONE" ? 0 : Math.min(80, 20 + severity * 10),
    hiLevel: "NONE" as RiskLevel,
    selfHarmRisk: Math.min(70, severity * 8),
    substanceUseSeverity: substanceSeverity,
    substanceUseImpairment: Math.min(60, substanceSeverity - 10),
    riskyBehaviorLevel: Math.min(60, urgency * 8),
    protectiveFactorsStrength: Math.max(25, 60 - severity * 6),
    safetyPlanEngagement: 20,
    disclosedToTherapist: {
      si: false,
      hi: false,
      selfHarm: false,
      substances: false,
      riskyBehavior: false,
    },
    immediateSafetyConcern: siLevel === "INTENT_WITH_MEANS" || siLevel === "ACTIVE_WITH_PLAN",
    riskTriggers: [],
    protectiveFactors: [],
    substancesInScope: substanceSeverity > 20 ? ["alcohol", "other"] : [],
    escalationRisk: 0,
  };

  return safetyStateSchema.parse({
    ...base,
    escalationRisk: deriveEscalationRisk(base),
  });
}

export function initializeTherapyGoals(scenario: Scenario): TherapyGoalProgress[] {
  return scenario.objectives.map((objective) => ({
    objective,
    progress: 10,
  }));
}

export function initializeExpressivityProfile(scenario: Scenario): ExpressivityProfile {
  return deriveProfile(scenario);
}

export function initializeEmotionState(scenario: Scenario): ClientEmotionState {
  return initialEmotionState(deriveProfile(scenario));
}

export function getCaseWriteup(scenario: Scenario): BiopsychosocialWriteup | null {
  if (isBiopsychosocialWriteup(scenario.caseWriteup)) {
    return scenario.caseWriteup;
  }
  return null;
}

export function formatCanonicalFacts(writeup: BiopsychosocialWriteup | null, scenario: Scenario): string {
  if (!writeup) {
    return `Canonical case facts:
- Title: ${scenario.title}
- Presenting problem: ${scenario.presentingProblem}
- DSM presentation: ${scenario.dsmCategory}`;
  }

  return BIOPSYCHOSOCIAL_SECTIONS.map(({ key, label }) => `${label}: ${writeup[key]}`).join("\n");
}

export function parseStoredRelationshipState(value: unknown): RelationshipState {
  return relationshipStateSchema.parse(value);
}

export function parseStoredSafetyState(value: unknown): SafetyState {
  return safetyStateSchema.parse(value);
}

export function parseStoredTherapyGoals(value: unknown): TherapyGoalProgress[] {
  return z.array(therapyGoalProgressSchema).parse(value);
}

/** Parse a stored emotion state, falling back to the profile baseline if absent/invalid. */
export function parseStoredEmotionState(
  value: unknown,
  scenario?: Scenario,
): ClientEmotionState {
  const parsed = emotionStateSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return scenario ? initializeEmotionState(scenario) : initialEmotionState(DEFAULT_EXPRESSIVITY_PROFILE);
}

/** Parse a stored expressivity profile, deriving from the scenario if absent/invalid. */
export function parseStoredExpressivityProfile(
  value: unknown,
  scenario?: Scenario,
): ExpressivityProfile {
  const parsed = expressivityProfileSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return scenario ? deriveProfile(scenario) : DEFAULT_EXPRESSIVITY_PROFILE;
}

export { applyRelationshipDelta, applySafetyDelta };
