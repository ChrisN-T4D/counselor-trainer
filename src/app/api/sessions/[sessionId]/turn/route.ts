import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createLlmProvider } from "@/lib/llm/factory";
import { classifyLlmError } from "@/lib/llm/errors";
import { isSuspiciousClientReply } from "@/lib/llm/message-content";
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
import {
  isMultiSpeakerContext,
  parseParticipantsConfig,
  parseSpeakerSegments,
} from "@/lib/sessions/participants";
import type { ChatMessage } from "@/lib/llm/provider";
import { CLIENT_DELIVERY_PROMPT } from "@/lib/voice/delivery-tags";

const turnSchema = z.object({
  content: z.string().min(1).max(4000),
});

type RouteParams = { params: Promise<{ sessionId: string }> };

function buildLegacyTranscriptMessages(
  systemPrompt: string,
  transcript: { role: "CLIENT" | "THERAPIST"; content: string }[],
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...transcript.map((turn) => ({
      role: (turn.role === "THERAPIST" ? "user" : "assistant") as "user" | "assistant",
      content: turn.content,
    })),
  ];
}

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
      speaker: message.speaker,
    })),
    { role: "THERAPIST" as const, content: therapistMessage.content, speaker: null },
  ];

  let llmMessages: ChatMessage[];

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
        skipVectorSearch: true,
      });

      llmMessages = buildConversationMessagesWithContext(context, transcript);
    } else {
      llmMessages = buildLegacyTranscriptMessages(
        `You are role-playing as a client. Scenario: ${practiceSession.scenario.title}. ${practiceSession.scenario.systemPrompt}

${CLIENT_DELIVERY_PROMPT}`,
        transcript,
      );
    }
  } catch (error) {
    console.error("Session context error:", error);
    return NextResponse.json({ error: "Failed to prepare session context" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const llm = createLlmProvider();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      write({ type: "therapist", message: therapistMessage });

      let clientReply = "";

      try {
        for await (const delta of llm.stream(llmMessages)) {
          clientReply += delta;
          write({ type: "delta", content: delta });
        }

        const trimmed = clientReply.trim();
        if (!trimmed) {
          throw new Error("LLM returned an empty response");
        }
        if (isSuspiciousClientReply(trimmed)) {
          throw new Error(
            `LLM returned an unusably short reply (${JSON.stringify(trimmed)}). Try raising OPENAI_CHAT_MAX_TOKENS.`,
          );
        }

        const participants = isMultiSpeakerContext(practiceSession.scenario.contextType)
          ? parseParticipantsConfig(practiceSession.scenario.participantsConfig)
          : null;

        const segments = participants
          ? parseSpeakerSegments(trimmed, participants)
          : [{ speaker: null as string | null, text: trimmed }];

        const clientMessages = [];
        for (let i = 0; i < segments.length; i++) {
          const segment = segments[i];
          const created = await db.message.create({
            data: {
              sessionId,
              role: "CLIENT",
              content: segment.text,
              speaker: segment.speaker ?? null,
              sequence: nextSequence + 1 + i,
            },
          });
          clientMessages.push(created);
        }

        // Back-compat single field plus the full attributed list.
        write({ type: "done", clientMessage: clientMessages[0], clientMessages });
      } catch (error) {
        console.error("LLM turn error:", error);
        const classified = classifyLlmError(error);
        write({ type: "error", error: classified.message, code: classified.code });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
