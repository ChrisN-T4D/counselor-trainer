import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createLlmProvider } from "@/lib/llm/factory";
import { classifyLlmError } from "@/lib/llm/errors";
import { db } from "@/lib/db";
import {
  parseStoredRelationshipState,
  parseStoredSafetyState,
  parseStoredTherapyGoals,
} from "@/lib/memory/case-init";
import {
  buildConversationMessagesWithContext,
  buildSessionContext,
} from "@/lib/sessions/prompts";

const turnSchema = z.object({
  content: z.string().min(1).max(4000),
});

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const body = await request.json();
  const parsed = turnSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const practiceSession = await db.session.findFirst({
    where: {
      id: sessionId,
      userId: session.user.id,
      status: "ACTIVE",
    },
    include: {
      scenario: true,
      clientCase: true,
      messages: { orderBy: { sequence: "asc" } },
    },
  });

  if (!practiceSession) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const nextSequence = practiceSession.messages.length + 1;

  const therapistMessage = await db.message.create({
    data: {
      sessionId,
      role: "THERAPIST",
      content: parsed.data.content.trim(),
      sequence: nextSequence,
    },
  });

  const transcript = [
    ...practiceSession.messages.map((message) => ({
      role: message.role as "CLIENT" | "THERAPIST",
      content: message.content,
    })),
    { role: "THERAPIST" as const, content: therapistMessage.content },
  ];

  let clientReply: string;

  try {
    if (practiceSession.clientCase) {
      const relationshipState = parseStoredRelationshipState(
        practiceSession.clientCase.relationshipState,
      );
      const safetyState = parseStoredSafetyState(practiceSession.clientCase.safetyState);
      const therapyGoals = parseStoredTherapyGoals(
        practiceSession.clientCase.therapyGoalProgress,
      );
      const disclosedFacts = Array.isArray(practiceSession.clientCase.disclosedFacts)
        ? (practiceSession.clientCase.disclosedFacts as string[])
        : [];

      const priorSummaries = await db.session.findMany({
        where: {
          clientCaseId: practiceSession.clientCase.id,
          status: "COMPLETED",
          episodicSummary: { not: null },
          sessionNumber: { lt: practiceSession.sessionNumber },
        },
        orderBy: { sessionNumber: "asc" },
        select: { sessionNumber: true, episodicSummary: true },
      });

      const context = await buildSessionContext({
        scenario: practiceSession.scenario,
        clientCase: practiceSession.clientCase,
        relationshipState,
        safetyState,
        therapyGoals,
        disclosedFacts,
        priorSessionSummaries: priorSummaries.map((item) => ({
          sessionNumber: item.sessionNumber,
          summary: item.episodicSummary ?? "",
        })),
        sessionNumber: practiceSession.sessionNumber,
        latestTherapistMessage: therapistMessage.content,
      });

      const llm = createLlmProvider();
      clientReply = await llm.complete(
        buildConversationMessagesWithContext(context, transcript),
      );
    } else {
      const llm = createLlmProvider();
      clientReply = await llm.complete([
        {
          role: "system",
          content: `You are role-playing as a client. Scenario: ${practiceSession.scenario.title}. ${practiceSession.scenario.systemPrompt}`,
        },
        ...transcript.map((turn) => ({
          role: (turn.role === "THERAPIST" ? "user" : "assistant") as "user" | "assistant",
          content: turn.content,
        })),
      ]);
    }
  } catch (error) {
    console.error("LLM turn error:", error);
    const classified = classifyLlmError(error);
    return NextResponse.json({ error: classified.message, code: classified.code }, { status: classified.status });
  }

  const clientMessage = await db.message.create({
    data: {
      sessionId,
      role: "CLIENT",
      content: clientReply,
      sequence: nextSequence + 1,
    },
  });

  return NextResponse.json({
    therapistMessage,
    clientMessage,
  });
}
