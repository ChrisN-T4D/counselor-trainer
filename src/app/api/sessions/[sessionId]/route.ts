import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canViewLearnerSession } from "@/lib/auth/session-access";
import { db } from "@/lib/db";
import { finalizeSessionMemory } from "@/lib/memory/client-case-service";
import { formatContextType } from "@/lib/scenarios/labels";
import { sanitizeScenarioForActiveSession } from "@/lib/scenarios/public-scenario";
import {
  isMultiSpeakerContext,
  parseParticipantsConfig,
  toPublicParticipants,
} from "@/lib/sessions/participants";

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const practiceSession = await db.session.findFirst({
    where: { id: sessionId },
    include: {
      scenario: true,
      clientCase: { select: { id: true, sessionCount: true } },
      messages: { orderBy: { sequence: "asc" } },
    },
  });

  if (
    !practiceSession ||
    !canViewLearnerSession(session.user.role, session.user.id, practiceSession.userId)
  ) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const revealWriteup = practiceSession.status === "COMPLETED";

  // Client-safe participant list (names/avatars only) for couples/family rendering.
  const participants = isMultiSpeakerContext(practiceSession.scenario.contextType)
    ? parseParticipantsConfig(practiceSession.scenario.participantsConfig)
    : null;
  const publicParticipants = participants ? toPublicParticipants(participants) : null;

  const baseScenario = revealWriteup
    ? practiceSession.scenario
    : sanitizeScenarioForActiveSession(practiceSession.scenario);

  // Never leak the server-only config (personas, voice IDs) to the browser.
  const { participantsConfig: _participantsConfig, ...scenarioRest } = baseScenario as typeof baseScenario & {
    participantsConfig?: unknown;
  };

  return NextResponse.json({
    session: {
      ...practiceSession,
      scenario: {
        ...scenarioRest,
        contextLabel: formatContextType(practiceSession.scenario.contextType),
        participants: publicParticipants,
      },
    },
  });
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

  try {
    await finalizeSessionMemory(sessionId, session.user.id);
  } catch (error) {
    console.error("Session memory consolidation error:", error);
  }

  return NextResponse.json({ session: updated });
}
