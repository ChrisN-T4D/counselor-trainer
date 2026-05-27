import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { findOrCreateClientCase } from "@/lib/memory/client-case-service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientCases = await db.clientCase.findMany({
    where: { userId: session.user.id },
    include: {
      scenario: {
        select: {
          title: true,
          contextType: true,
          dsmCategory: true,
        },
      },
      sessions: {
        where: { status: "ACTIVE" },
        select: { id: true },
        take: 1,
      },
      _count: { select: { sessions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    clientCases: clientCases.map((item) => ({
      id: item.id,
      displayName: item.displayName,
      status: item.status,
      sessionCount: item.sessionCount,
      lastSessionAt: item.lastSessionAt,
      scenario: item.scenario,
      totalSessions: item._count.sessions,
      activeSessionId: item.sessions[0]?.id ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { scenarioId?: string };
  if (!body.scenarioId) {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const clientCase = await findOrCreateClientCase(session.user.id, body.scenarioId);
  return NextResponse.json({ clientCase }, { status: 201 });
}
