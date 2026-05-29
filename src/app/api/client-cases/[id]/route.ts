import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { classifyLlmError } from "@/lib/llm/errors";
import { getActiveSessionForCase, startCaseSession } from "@/lib/memory/client-case-service";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const clientCase = await db.clientCase.findFirst({
    where: { id, userId: session.user.id },
    include: {
      scenario: true,
      sessions: {
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          sessionNumber: true,
          status: true,
          startedAt: true,
          endedAt: true,
          episodicSummary: true,
        },
      },
      stateSnapshots: {
        orderBy: { capturedAt: "asc" },
      },
    },
  });

  if (!clientCase) {
    return NextResponse.json({ error: "Client case not found" }, { status: 404 });
  }

  return NextResponse.json({ clientCase });
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const activeForCase = await getActiveSessionForCase(id, session.user.id);
    if (activeForCase) {
      return NextResponse.json({ session: activeForCase, resumed: true }, { status: 200 });
    }

    const practiceSession = await startCaseSession(session.user.id, id);
    return NextResponse.json({ session: practiceSession, resumed: false }, { status: 201 });
  } catch (error) {
    console.error("Start case session error:", error);
    const classified = classifyLlmError(error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.status },
    );
  }
}
