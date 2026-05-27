import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createLlmProvider } from "@/lib/llm/factory";
import { db } from "@/lib/db";
import { buildConversationMessages } from "@/lib/sessions/prompts";

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

  const llm = createLlmProvider();
  let clientReply: string;

  try {
    clientReply = await llm.complete(
      buildConversationMessages(practiceSession.scenario, transcript),
    );
  } catch (error) {
    console.error("LLM turn error:", error);
    return NextResponse.json(
      { error: "Failed to generate client response. Check LLM configuration." },
      { status: 502 },
    );
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
