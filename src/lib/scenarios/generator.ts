import { z } from "zod";
import type { ScenarioContextType } from "@/generated/prisma/client";
import {
  getScenarioGenerationTimeoutMs,
  getScenarioMaxTokens,
  getScenarioModel,
} from "@/lib/llm/config";
import type { LlmProvider } from "@/lib/llm/provider";
import type { ClientGender } from "@/lib/voice/voice-catalog";
import { selectClientVoiceId } from "@/lib/voice/voice-catalog";

export const scenarioGenerationInputSchema = z.object({
  contextType: z.enum([
    "MEDICAL_FAMILY_THERAPY",
    "DOCTOR_HANDOFF",
    "PEDIATRIC_PARENT_CHILD",
    "INDIVIDUAL",
    "COUPLES",
    "FAMILY",
  ]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  symptomSeverity: z.number().int().min(1).max(5),
  clientResistance: z.number().int().min(1).max(5),
  sessionUrgency: z.number().int().min(1).max(5),
  ageGroup: z.enum(["child", "adolescent", "adult", "older_adult"]),
  referralSource: z.enum(["doctor", "self", "school", "family", "other"]),
  participants: z.array(z.string().min(1)).min(1).max(5),
  focusAreas: z.array(z.string().min(1)).max(5).default([]),
});

export type ScenarioGenerationInput = z.infer<typeof scenarioGenerationInputSchema>;

export const generatedScenarioSchema = z.object({
  title: z.string().min(8).max(100),
  dsmCategory: z.string().min(3).max(200),
  presentingProblem: z.string().min(30).max(600),
  systemPrompt: z.string().min(80).max(2000),
  objectives: z.array(z.string().min(8).max(200)).min(3).max(5),
  difficulty: z.string().min(1),
  clientGender: z.enum(["female", "male", "neutral"]),
  caseWriteup: z.object({
    identifyingSnapshot: z.string().min(20),
    presentingConcerns: z.string().min(20),
    biologicalFactors: z.string().min(20),
    psychologicalFactors: z.string().min(20),
    socialSystemicFactors: z.string().min(20),
    riskSafety: z.string().min(20),
    workingHypotheses: z.string().min(20),
    sessionGoals: z.string().min(20),
    interventionConsiderations: z.string().min(20),
  }),
});

export type GeneratedScenario = z.infer<typeof generatedScenarioSchema>;

export type GeneratedScenarioWithVoice = GeneratedScenario & {
  clientVoiceId: string;
};

function contextLabel(contextType: ScenarioContextType) {
  return contextType
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function buildGenerationPrompt(input: ScenarioGenerationInput): string {
  return `You are generating a counselor training scenario.
Return ONLY valid JSON. No markdown and no explanation.

Scenario constraints:
- Context type: ${contextLabel(input.contextType)}
- Difficulty: ${input.difficulty}
- Symptom severity (1-5): ${input.symptomSeverity}
- Client resistance (1-5): ${input.clientResistance}
- Session urgency (1-5): ${input.sessionUrgency}
- Age group: ${input.ageGroup}
- Referral source: ${input.referralSource}
- Participants: ${input.participants.join(", ")}
- Focus areas: ${input.focusAreas.join(", ") || "general counseling skills"}

Output JSON schema:
{
  "title": string,
  "dsmCategory": string,
  "presentingProblem": string,
  "systemPrompt": string,
  "objectives": string[],
  "difficulty": "${input.difficulty}",
  "clientGender": "female" | "male" | "neutral",
  "caseWriteup": {
    "identifyingSnapshot": string,
    "presentingConcerns": string,
    "biologicalFactors": string,
    "psychologicalFactors": string,
    "socialSystemicFactors": string,
    "riskSafety": string,
    "workingHypotheses": string,
    "sessionGoals": string,
    "interventionConsiderations": string
  }
}

Rules:
- This write-up is hidden until after session completion.
- Case details must be realistic and internally consistent.
- Avoid definitive diagnosis language; use training-oriented conceptualization.
- Make systemPrompt role-play ready for the client perspective in first person (under 400 words).
- Set clientGender to match the primary client in identifyingSnapshot (female, male, or neutral if unclear).
- Objectives: 3 concrete counseling skills (one short sentence each).
- Keep each caseWriteup field to 2-3 sentences (roughly 40-120 characters each). Be concise.`;
}

function parseLlmJson(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const unwrapped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(unwrapped);
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new SyntaxError("Could not parse JSON from model response");
  }
}

export async function generateScenarioFromSettings(
  llm: LlmProvider,
  input: ScenarioGenerationInput,
): Promise<GeneratedScenarioWithVoice> {
  const prompt = buildGenerationPrompt(input);
  const raw = await llm.complete(
    [
      {
        role: "system",
        content:
          "You generate counselor training scenarios. Output strict JSON only. Be concise in every field.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    {
      model: getScenarioModel(),
      maxTokens: getScenarioMaxTokens(),
      generation: true,
      timeoutMs: getScenarioGenerationTimeoutMs(),
      jsonMode: true,
      temperature: 0.6,
    },
  );

  const parsed = parseLlmJson(raw);
  const scenario = generatedScenarioSchema.parse(parsed);
  const clientVoiceId = selectClientVoiceId({
    ageGroup: input.ageGroup,
    gender: scenario.clientGender as ClientGender,
  });

  return { ...scenario, clientVoiceId };
}
