import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { findOrCreateClientCase, startCaseSession } from "@/lib/memory/client-case-service";

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
    const clientCase = await findOrCreateClientCase(session.user.id, parsed.data.scenarioId);
    const practiceSession = await startCaseSession(session.user.id, clientCase.id);
    return NextResponse.json(
      { session: practiceSession, clientCaseId: clientCase.id },
      { status: 201 },
    );
  } catch (error) {
    console.error("Session start error:", error);
    return NextResponse.json(
      {
        error:
          "Failed to start session. Check OPENAI_BASE_URL and OPENAI_MODEL, or try again in a moment.",
      },
      { status: 504 },
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
