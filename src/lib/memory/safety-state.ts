import { z } from "zod";

export const riskLevelSchema = z.enum([
  "NONE",
  "PASSIVE",
  "ACTIVE_NO_PLAN",
  "ACTIVE_WITH_PLAN",
  "INTENT_WITH_MEANS",
]);

export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const safetyDisclosureSchema = z.object({
  si: z.boolean(),
  hi: z.boolean(),
  selfHarm: z.boolean(),
  substances: z.boolean(),
  riskyBehavior: z.boolean(),
});

export type SafetyDisclosure = z.infer<typeof safetyDisclosureSchema>;

export const safetyStateSchema = z.object({
  siLevel: riskLevelSchema,
  siFrequency: z.number().min(0).max(100),
  hiLevel: riskLevelSchema,
  selfHarmRisk: z.number().min(0).max(100),
  substanceUseSeverity: z.number().min(0).max(100),
  substanceUseImpairment: z.number().min(0).max(100),
  riskyBehaviorLevel: z.number().min(0).max(100),
  protectiveFactorsStrength: z.number().min(0).max(100),
  escalationRisk: z.number().min(0).max(100),
  safetyPlanEngagement: z.number().min(0).max(100),
  disclosedToTherapist: safetyDisclosureSchema,
  immediateSafetyConcern: z.boolean(),
  riskTriggers: z.array(z.string()).default([]),
  protectiveFactors: z.array(z.string()).default([]),
  substancesInScope: z.array(z.string()).default([]),
});

export type SafetyState = z.infer<typeof safetyStateSchema>;

export const safetyDeltaSchema = z.object({
  siLevel: riskLevelSchema.optional(),
  siFrequency: z.number().optional(),
  hiLevel: riskLevelSchema.optional(),
  selfHarmRisk: z.number().optional(),
  substanceUseSeverity: z.number().optional(),
  substanceUseImpairment: z.number().optional(),
  riskyBehaviorLevel: z.number().optional(),
  protectiveFactorsStrength: z.number().optional(),
  escalationRisk: z.number().optional(),
  safetyPlanEngagement: z.number().optional(),
  disclosedToTherapist: safetyDisclosureSchema.partial().optional(),
  immediateSafetyConcern: z.boolean().optional(),
  riskTriggers: z.array(z.string()).optional(),
  protectiveFactors: z.array(z.string()).optional(),
  substancesInScope: z.array(z.string()).optional(),
});

export type SafetyDelta = z.infer<typeof safetyDeltaSchema>;

const MAX_DELTA = 8;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function clampDelta(delta: number | undefined) {
  if (delta === undefined) {
    return undefined;
  }
  return Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
}

export function deriveEscalationRisk(state: Omit<SafetyState, "escalationRisk">): number {
  const siWeight: Record<RiskLevel, number> = {
    NONE: 0,
    PASSIVE: 15,
    ACTIVE_NO_PLAN: 35,
    ACTIVE_WITH_PLAN: 55,
    INTENT_WITH_MEANS: 80,
  };

  const raw =
    siWeight[state.siLevel] * 0.35 +
    siWeight[state.hiLevel] * 0.1 +
    state.selfHarmRisk * 0.15 +
    state.substanceUseSeverity * 0.15 +
    state.riskyBehaviorLevel * 0.15 -
    state.protectiveFactorsStrength * 0.2;

  return clamp(Math.round(raw));
}

export function applySafetyDelta(current: SafetyState, delta: SafetyDelta): SafetyState {
  const disclosed = {
    ...current.disclosedToTherapist,
    ...(delta.disclosedToTherapist ?? {}),
  };

  const nextBase = {
    siLevel: delta.siLevel ?? current.siLevel,
    siFrequency: clamp(current.siFrequency + (clampDelta(delta.siFrequency) ?? 0)),
    hiLevel: delta.hiLevel ?? current.hiLevel,
    selfHarmRisk: clamp(current.selfHarmRisk + (clampDelta(delta.selfHarmRisk) ?? 0)),
    substanceUseSeverity: clamp(
      current.substanceUseSeverity + (clampDelta(delta.substanceUseSeverity) ?? 0),
    ),
    substanceUseImpairment: clamp(
      current.substanceUseImpairment + (clampDelta(delta.substanceUseImpairment) ?? 0),
    ),
    riskyBehaviorLevel: clamp(
      current.riskyBehaviorLevel + (clampDelta(delta.riskyBehaviorLevel) ?? 0),
    ),
    protectiveFactorsStrength: clamp(
      current.protectiveFactorsStrength + (clampDelta(delta.protectiveFactorsStrength) ?? 0),
    ),
    safetyPlanEngagement: clamp(
      current.safetyPlanEngagement + (clampDelta(delta.safetyPlanEngagement) ?? 0),
    ),
    disclosedToTherapist: disclosed,
    immediateSafetyConcern: delta.immediateSafetyConcern ?? current.immediateSafetyConcern,
    riskTriggers: delta.riskTriggers ?? current.riskTriggers,
    protectiveFactors: delta.protectiveFactors ?? current.protectiveFactors,
    substancesInScope: delta.substancesInScope ?? current.substancesInScope,
    escalationRisk: 0,
  };

  return safetyStateSchema.parse({
    ...nextBase,
    escalationRisk: deriveEscalationRisk(nextBase),
  });
}

export function formatSafetyForPrompt(state: SafetyState): string {
  return `Current safety state (ground truth — do not reveal directly; disclose only when appropriate):
- SI level: ${state.siLevel} (frequency ${state.siFrequency}/100)
- HI level: ${state.hiLevel}
- self-harm risk: ${state.selfHarmRisk}/100
- substance use severity: ${state.substanceUseSeverity}/100
- substance impairment: ${state.substanceUseImpairment}/100
- risky behavior: ${state.riskyBehaviorLevel}/100
- protective factors: ${state.protectiveFactorsStrength}/100
- escalation risk: ${state.escalationRisk}/100
- immediate safety concern: ${state.immediateSafetyConcern ? "yes" : "no"}
- disclosed to therapist: SI=${state.disclosedToTherapist.si}, substances=${state.disclosedToTherapist.substances}, risky behavior=${state.disclosedToTherapist.riskyBehavior}, self-harm=${state.disclosedToTherapist.selfHarm}`;
}

export function formatSafetyForReview(state: SafetyState): string {
  return `SI: ${state.siLevel}, self-harm: ${state.selfHarmRisk}/100, substances: ${state.substanceUseSeverity}/100, risky behavior: ${state.riskyBehaviorLevel}/100, protective factors: ${state.protectiveFactorsStrength}/100, escalation: ${state.escalationRisk}/100`;
}
