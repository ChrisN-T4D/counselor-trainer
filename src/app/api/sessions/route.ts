import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { classifyLlmError } from "@/lib/llm/errors";
import {
  findOrCreateClientCase,
  getActiveSessionForScenario,
  startCaseSession,
} from "@/lib/memory/client-case-service";

const createSessionSchema = z.object({
  scenarioId: z.string().min(1),
});

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

  try {
    const existingActive = await getActiveSessionForScenario(
      session.user.id,
      parsed.data.scenarioId,
    );

    if (existingActive) {
      const clientCase = await findOrCreateClientCase(session.user.id, parsed.data.scenarioId);
      if (existingActive.clientCaseId !== clientCase.id) {
        await db.session.update({
          where: { id: existingActive.id },
          data: { clientCaseId: clientCase.id },
        });
      }

      const resumed = await db.session.findFirst({
        where: { id: existingActive.id },
        include: {
          scenario: true,
          clientCase: true,
          messages: { orderBy: { sequence: "asc" } },
        },
      });

      return NextResponse.json(
        { session: resumed ?? existingActive, clientCaseId: clientCase.id, resumed: true },
        { status: 200 },
      );
    }

    const clientCase = await findOrCreateClientCase(session.user.id, parsed.data.scenarioId);
    const practiceSession = await startCaseSession(session.user.id, clientCase.id);
    return NextResponse.json(
      { session: practiceSession, clientCaseId: clientCase.id, resumed: false },
      { status: 201 },
    );
  } catch (error) {
    console.error("Session start error:", error);
    const classified = classifyLlmError(error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
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
      clientCase: { select: { id: true, displayName: true, sessionCount: true } },
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
