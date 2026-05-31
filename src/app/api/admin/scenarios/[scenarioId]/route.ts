import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { db } from "@/lib/db";

type RouteContext = {
  params: Promise<{ scenarioId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scenarioId } = await context.params;

  const scenario = await db.scenario.findUnique({
    where: { id: scenarioId },
    select: {
      id: true,
      title: true,
      _count: { select: { sessions: true, clientCases: true } },
    },
  });

  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  await db.scenario.delete({ where: { id: scenarioId } });

  return NextResponse.json({
    deleted: true,
    title: scenario.title,
    sessionsRemoved: scenario._count.sessions,
    casesRemoved: scenario._count.clientCases,
  });
}
