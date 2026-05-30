import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createLlmProvider } from "@/lib/llm/factory";
import {
  getLlmConfigIssues,
  getScenarioGenerationTimeoutMs,
  llmConfigErrorMessage,
} from "@/lib/llm/config";
import { classifyLlmError } from "@/lib/llm/errors";
import {
  generateScenarioFromSettings,
  scenarioGenerationInputSchema,
} from "@/lib/scenarios/generator";
import { PUBLIC_SCENARIO_SELECT } from "@/lib/scenarios/public-scenario";

function acuityFromUrgency(sessionUrgency: number) {
  if (sessionUrgency <= 2) {
    return "low";
  }
  if (sessionUrgency <= 3) {
    return "moderate";
  }
  return "high";
}

export const maxDuration = 300;

const GENERATION_TIMEOUT_MS = getScenarioGenerationTimeoutMs();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Scenario generation timed out")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configIssues = getLlmConfigIssues();
  if (configIssues.length > 0) {
    return NextResponse.json(
      { error: llmConfigErrorMessage(configIssues), code: "llm_config" },
      { status: 503 },
    );
  }

  const body = await request.json();
  const parsedInput = scenarioGenerationInputSchema.safeParse(body);
  if (!parsedInput.success) {
    return NextResponse.json({ error: "Invalid scenario settings" }, { status: 400 });
  }

  const llm = createLlmProvider();
  let generated;
  try {
    generated = await withTimeout(
      generateScenarioFromSettings(llm, parsedInput.data),
      GENERATION_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("Scenario generation error:", error);
    const classified = classifyLlmError(error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
  }

  const created = await db.scenario.create({
    data: {
      title: generated.title,
      contextType: parsedInput.data.contextType,
      dsmCategory: generated.dsmCategory,
      presentingProblem: generated.presentingProblem,
      systemPrompt: generated.systemPrompt,
      objectives: generated.objectives,
      difficulty: parsedInput.data.difficulty,
      ageGroup: parsedInput.data.ageGroup,
      acuityLevel: acuityFromUrgency(parsedInput.data.sessionUrgency),
      referralSource: parsedInput.data.referralSource,
      sessionParticipants: parsedInput.data.participants,
      generationSettings: parsedInput.data,
      caseWriteup: generated.caseWriteup,
      clientVoiceId: generated.clientVoiceId,
      isTemplate: false,
    },
    select: PUBLIC_SCENARIO_SELECT,
  });

  return NextResponse.json({ scenario: created }, { status: 201 });
}
