import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createLlmProvider } from "@/lib/llm/factory";
import { getLlmConfigIssues, llmConfigErrorMessage } from "@/lib/llm/config";
import { classifyLlmError } from "@/lib/llm/errors";
import {
  generateScenarioFromSettingsStreaming,
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

type StreamEvent =
  | { type: "progress"; percent: number; stage: "drafting" | "parsing" | "saving" }
  | { type: "complete"; percent: 100; scenario: unknown }
  | { type: "error"; error: string; code: string };

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
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const generated = await generateScenarioFromSettingsStreaming(
          llm,
          parsedInput.data,
          (update) => {
            send({ type: "progress", percent: update.percent, stage: update.stage });
          },
        );

        send({ type: "progress", percent: 96, stage: "saving" });

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
            clientAvatarKey: generated.clientAvatarKey,
            isTemplate: false,
          },
          select: PUBLIC_SCENARIO_SELECT,
        });

        send({ type: "complete", percent: 100, scenario: created });
      } catch (error) {
        console.error("Scenario generation error:", error);
        const classified = classifyLlmError(error);
        send({ type: "error", error: classified.message, code: classified.code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
