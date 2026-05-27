import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const practiceSession = await db.session.findFirst({
    where: { id: sessionId, userId: session.user.id },
    include: {
      scenario: true,
      messages: { orderBy: { sequence: "asc" } },
    },
  });

  if (!practiceSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: practiceSession });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const practiceSession = await db.session.findFirst({
    where: { id: sessionId, userId: session.user.id, status: "ACTIVE" },
  });

  if (!practiceSession) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const endedAt = new Date();
  const practiceSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - practiceSession.startedAt.getTime()) / 1000),
  );

  const updated = await db.session.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      endedAt,
      practiceSeconds,
    },
  });

  return NextResponse.json({ session: updated });
}
