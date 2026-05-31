import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createLlmProvider } from "@/lib/llm/factory";
import { classifyLlmError } from "@/lib/llm/errors";
import { db } from "@/lib/db";
import { buildCoachingHelpMessages } from "@/lib/sessions/coaching-help";
import { sanitizeScenarioForActiveSession } from "@/lib/scenarios/public-scenario";

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const practiceSession = await db.session.findFirst({
    where: {
      id: sessionId,
      userId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      scenario: true,
      messages: { orderBy: { sequence: "asc" } },
    },
  });

  if (!practiceSession) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const scenario = sanitizeScenarioForActiveSession(practiceSession.scenario);
  const transcript = practiceSession.messages.map((message) => ({
    role: message.role as "CLIENT" | "THERAPIST",
    content: message.content,
  }));

  const llm = createLlmProvider();

  try {
    const suggestions = await llm.complete(
      buildCoachingHelpMessages(
        {
          title: scenario.title,
          dsmCategory: scenario.dsmCategory,
          presentingProblem: scenario.presentingProblem,
        },
        transcript,
      ),
      { maxTokens: 512, reasoning: "off" },
    );

    const trimmed = suggestions.trim();
    if (!trimmed) {
      throw new Error("LLM returned empty coaching suggestions");
    }

    return NextResponse.json({ suggestions: trimmed });
  } catch (error) {
    console.error("Coaching help error:", error);
    const classified = classifyLlmError(error);
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: 502 });
  }
}
