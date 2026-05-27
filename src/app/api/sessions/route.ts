import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createLlmProvider } from "@/lib/llm/factory";
import { db } from "@/lib/db";
import {
  buildConversationMessages,
  buildOpeningUserPrompt,
} from "@/lib/sessions/prompts";

const createSessionSchema = z.object({
  scenarioId: z.string().min(1),
});

const OPENING_TIMEOUT_MS = 30000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("LLM opening timed out")), timeoutMs);
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

  const body = await request.json();
  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const scenario = await db.scenario.findUnique({
    where: { id: parsed.data.scenarioId },
  });

  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const llm = createLlmProvider();
  const openingMessages = [
    ...buildConversationMessages(scenario, []),
    { role: "user" as const, content: buildOpeningUserPrompt() },
  ];

  let clientOpening: string;
  try {
    clientOpening = await withTimeout(llm.complete(openingMessages), OPENING_TIMEOUT_MS);
  } catch (error) {
    console.error("LLM opening error:", error);
    return NextResponse.json(
      {
        error:
          "Failed to generate client opening. Check OPENAI_BASE_URL and OPENAI_MODEL, or try again in a moment.",
      },
      { status: 504 },
    );
  }

  const practiceSession = await db.session.create({
    data: {
      userId: session.user.id,
      scenarioId: scenario.id,
      messages: {
        create: [
          {
            role: "CLIENT",
            content: clientOpening,
            sequence: 1,
          },
        ],
      },
    },
    include: {
      scenario: true,
      messages: { orderBy: { sequence: "asc" } },
    },
  });

  return NextResponse.json({ session: practiceSession }, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await db.session.findMany({
    where: { userId: session.user.id },
    include: {
      scenario: { select: { title: true, dsmCategory: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  const totals = await db.session.aggregate({
    where: {
      userId: session.user.id,
      status: "COMPLETED",
    },
    _sum: {
      practiceSeconds: true,
      reviewSeconds: true,
    },
  });

  return NextResponse.json({
    sessions,
    totals: {
      practiceSeconds: totals._sum.practiceSeconds ?? 0,
      reviewSeconds: totals._sum.reviewSeconds ?? 0,
    },
  });
}
