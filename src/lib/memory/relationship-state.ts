import { z } from "zod";

export const relationshipStateSchema = z.object({
  trust: z.number().min(0).max(100),
  openness: z.number().min(0).max(100),
  alliance: z.number().min(0).max(100),
  resistance: z.number().min(0).max(100),
  deception: z.number().min(0).max(100),
  emotionalRegulation: z.number().min(0).max(100),
  goalProgress: z.number().min(0).max(100),
  dropoutRisk: z.number().min(0).max(100),
  returnLikelihood: z.number().min(0).max(100),
  ruptureActive: z.boolean(),
  repairAttempts: z.number().int().min(0),
  clientPerceptionOfTherapist: z.string().optional(),
  unresolvedConcerns: z.array(z.string()).default([]),
  recentTriggers: z.array(z.string()).default([]),
});

export type RelationshipState = z.infer<typeof relationshipStateSchema>;

export const relationshipDeltaSchema = z.object({
  trust: z.number().optional(),
  openness: z.number().optional(),
  alliance: z.number().optional(),
  resistance: z.number().optional(),
  deception: z.number().optional(),
  emotionalRegulation: z.number().optional(),
  goalProgress: z.number().optional(),
  dropoutRisk: z.number().optional(),
  ruptureActive: z.boolean().optional(),
  repairAttempts: z.number().int().optional(),
  clientPerceptionOfTherapist: z.string().optional(),
  unresolvedConcerns: z.array(z.string()).optional(),
  recentTriggers: z.array(z.string()).optional(),
});

export type RelationshipDelta = z.infer<typeof relationshipDeltaSchema>;

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

export function applyRelationshipDelta(
  current: RelationshipState,
  delta: RelationshipDelta,
): RelationshipState {
  const next: RelationshipState = {
    ...current,
    trust: clamp(current.trust + (clampDelta(delta.trust) ?? 0)),
    openness: clamp(current.openness + (clampDelta(delta.openness) ?? 0)),
    alliance: clamp(current.alliance + (clampDelta(delta.alliance) ?? 0)),
    resistance: clamp(current.resistance + (clampDelta(delta.resistance) ?? 0)),
    deception: clamp(current.deception + (clampDelta(delta.deception) ?? 0)),
    emotionalRegulation: clamp(
      current.emotionalRegulation + (clampDelta(delta.emotionalRegulation) ?? 0),
    ),
    goalProgress: clamp(current.goalProgress + (clampDelta(delta.goalProgress) ?? 0)),
    dropoutRisk: clamp(current.dropoutRisk + (clampDelta(delta.dropoutRisk) ?? 0)),
    ruptureActive: delta.ruptureActive ?? current.ruptureActive,
    repairAttempts:
      delta.repairAttempts !== undefined
        ? Math.max(0, current.repairAttempts + delta.repairAttempts)
        : current.repairAttempts,
    clientPerceptionOfTherapist:
      delta.clientPerceptionOfTherapist ?? current.clientPerceptionOfTherapist,
    unresolvedConcerns: delta.unresolvedConcerns ?? current.unresolvedConcerns,
    recentTriggers: delta.recentTriggers ?? current.recentTriggers,
    returnLikelihood: 0,
  };

  next.returnLikelihood = clamp(100 - next.dropoutRisk);
  return next;
}

export function formatRelationshipForPrompt(state: RelationshipState): string {
  return `Current relationship state (internal, do not mention explicitly):
- trust: ${state.trust}/100
- openness: ${state.openness}/100
- alliance: ${state.alliance}/100
- resistance: ${state.resistance}/100
- deception: ${state.deception}/100
- emotional regulation: ${state.emotionalRegulation}/100
- goal progress: ${state.goalProgress}/100
- dropout risk: ${state.dropoutRisk}/100
- rupture active: ${state.ruptureActive ? "yes" : "no"}
- repair attempts observed: ${state.repairAttempts}
${state.clientPerceptionOfTherapist ? `- client view of therapist: ${state.clientPerceptionOfTherapist}` : ""}`;
}
