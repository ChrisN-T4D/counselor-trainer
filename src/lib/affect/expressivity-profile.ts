import { z } from "zod";
import type { Scenario } from "@/generated/prisma/client";
import { EKMAN_AXES, zeroEmotion, type EmotionVector } from "./emotion";

// The "psyche profile": how a client's *felt* emotion becomes *displayed* affect.
// Separating felt from displayed lets a guarded/alexithymic client feel a lot but
// show little, while a dysregulated client shows more than they feel. Derived
// once from the scenario + case and stored on the ClientCase.

const emotionVectorSchema = z.object({
  anger: z.number(),
  disgust: z.number(),
  fear: z.number(),
  sadness: z.number(),
  enjoyment: z.number(),
  surprise: z.number(),
  contempt: z.number(),
});

export const expressivityProfileSchema = z.object({
  // Per-axis display gain (felt -> shown). <1 dampens, >1 amplifies.
  gain: emotionVectorSchema,
  // Resting felt level per axis the state decays toward (e.g. depressive sadness).
  baseline: emotionVectorSchema,
  // Global multiplier on how strongly appraisal deltas move felt emotion.
  reactivity: z.number().min(0).max(3),
  // Per-second decay rate of felt emotion back toward baseline (0..1-ish).
  decayRate: z.number().min(0).max(2),
  // Resting arousal/energy the state decays toward (0..1).
  arousalBaseline: z.number().min(0).max(1),
  // Global expressiveness multiplier applied to all displayed morphs.
  expressiveness: z.number().min(0).max(2),
  // Axes that "leak" even when the client is suppressing (micro-expressions).
  leakChannels: z.array(z.enum(EKMAN_AXES)),
});

export type ExpressivityProfile = z.infer<typeof expressivityProfileSchema>;

export const DEFAULT_EXPRESSIVITY_PROFILE: ExpressivityProfile = {
  gain: { anger: 1, disgust: 1, fear: 1, sadness: 1, enjoyment: 1, surprise: 1, contempt: 1 },
  baseline: zeroEmotion(),
  reactivity: 1,
  decayRate: 0.25,
  arousalBaseline: 0.3,
  expressiveness: 1,
  leakChannels: [],
};

type GenerationSettings = {
  clientResistance?: number;
  symptomSeverity?: number;
  sessionUrgency?: number;
};

function readGenerationSettings(scenario: Pick<Scenario, "generationSettings">): GenerationSettings {
  if (!scenario.generationSettings || typeof scenario.generationSettings !== "object") return {};
  return scenario.generationSettings as GenerationSettings;
}

function acuityScale(acuity: string): number {
  switch (acuity.toLowerCase()) {
    case "low":
    case "mild":
      return 0.6;
    case "high":
    case "severe":
    case "acute":
      return 1.4;
    default:
      return 1;
  }
}

type ProfileScenario = Pick<
  Scenario,
  "generationSettings" | "acuityLevel" | "presentingProblem" | "dsmCategory" | "systemPrompt"
>;

/**
 * Derive a client's expressivity profile from existing scenario/case fields.
 * Heuristic but deterministic: resistance -> guardedness (low gain), severity +
 * acuity -> reactivity/baseline, and DSM/presenting keywords seed resting affect.
 */
export function deriveProfile(
  scenario: ProfileScenario,
  _clientCase?: { relationshipState?: unknown } | null,
): ExpressivityProfile {
  const settings = readGenerationSettings(scenario);
  const resistance = settings.clientResistance ?? 2; // 0..5-ish
  const severity = settings.symptomSeverity ?? 3;
  const acuity = acuityScale(scenario.acuityLevel ?? "moderate");

  // Guardedness: more resistance => lower overall gain (suppresses display).
  const guardedness = Math.min(0.8, resistance * 0.14);
  const baseGain = 1 - guardedness; // 1.0 (open) .. ~0.2 (very guarded)

  const gain: EmotionVector = {
    anger: baseGain,
    disgust: baseGain,
    fear: baseGain,
    sadness: baseGain,
    enjoyment: baseGain,
    surprise: baseGain,
    contempt: baseGain,
  };

  const baseline = zeroEmotion();

  const text = `${scenario.presentingProblem} ${scenario.dsmCategory} ${scenario.systemPrompt}`.toLowerCase();
  const sev01 = Math.min(1, (severity / 5) * acuity);

  const leakChannels: ExpressivityProfile["leakChannels"] = [];

  if (/depress|dysthym|hopeless|grief|loss|bereave/.test(text)) {
    baseline.sadness = Math.min(0.55, 0.25 + sev01 * 0.3);
    gain.enjoyment *= 0.6; // flattened positive affect
    leakChannels.push("sadness");
  }
  if (/anx|panic|ptsd|trauma|phobi|worry|stress/.test(text)) {
    baseline.fear = Math.min(0.5, 0.2 + sev01 * 0.3);
    leakChannels.push("fear");
  }
  if (/anger|irritab|hostil|opposition|defian|conduct|aggress/.test(text)) {
    baseline.anger = Math.min(0.45, 0.15 + sev01 * 0.25);
    leakChannels.push("anger");
  }
  if (/shame|guilt|self-?critic|worthless/.test(text)) {
    baseline.disgust = Math.min(0.3, 0.1 + sev01 * 0.2);
  }

  // Reactivity: severe/acute clients swing harder; guarded clients integrate slower.
  const reactivity = Math.max(0.4, Math.min(2.2, acuity * (1.1 - guardedness * 0.4) * (0.8 + sev01 * 0.6)));
  // Dysregulation (high severity, low resistance) decays slower (lingers).
  const decayRate = Math.max(0.1, Math.min(0.6, 0.32 - sev01 * 0.12 + guardedness * 0.08));
  const arousalBaseline = Math.max(0.15, Math.min(0.6, 0.28 + (baseline.fear + baseline.anger) * 0.4));
  // Overall expressiveness: guarded clients read more muted.
  const expressiveness = Math.max(0.45, Math.min(1.3, 1 - guardedness * 0.5 + sev01 * 0.2));

  return expressivityProfileSchema.parse({
    gain,
    baseline,
    reactivity,
    decayRate,
    arousalBaseline,
    expressiveness,
    leakChannels: Array.from(new Set(leakChannels)),
  });
}

export function parseStoredProfile(value: unknown): ExpressivityProfile {
  return expressivityProfileSchema.parse(value);
}
