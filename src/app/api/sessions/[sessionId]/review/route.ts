import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { canViewLearnerSession } from "@/lib/auth/session-access";
import { db } from "@/lib/db";
import { isBiopsychosocialWriteup } from "@/lib/scenarios/case-writeup";
import { formatContextType } from "@/lib/scenarios/labels";

type RouteParams = { params: Promise<{ sessionId: string }> };

const reviewSchema = z.object({
  learnerConclusions: z.string().min(10).max(4000),
  learnerWhatILearned: z.string().min(10).max(4000),
  learnerInterventionRationale: z.string().min(10).max(4000),
});

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
      clientCase: true,
      messages: { orderBy: { sequence: "asc" } },
      review: true,
    },
  });

  if (
    !practiceSession ||
    !canViewLearnerSession(session.user.role, session.user.id, practiceSession.userId)
  ) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (practiceSession.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Review is available only after session completion" },
      { status: 403 },
    );
  }

  const caseWriteup = isBiopsychosocialWriteup(practiceSession.scenario.caseWriteup)
    ? practiceSession.scenario.caseWriteup
    : null;

  let stateSnapshots: {
    id: string;
    sessionNumber: number | null;
    source: string;
    relationship: unknown;
    safety: unknown;
    delta: unknown;
    rationale: string | null;
    capturedAt: Date;
  }[] = [];

  if (practiceSession.clientCaseId) {
    stateSnapshots = await db.caseStateSnapshot.findMany({
      where: { clientCaseId: practiceSession.clientCaseId },
      orderBy: { capturedAt: "asc" },
      select: {
        id: true,
        sessionNumber: true,
        source: true,
        relationship: true,
        safety: true,
        delta: true,
        rationale: true,
        capturedAt: true,
      },
    });
  }

  return NextResponse.json({
    session: {
      id: practiceSession.id,
      status: practiceSession.status,
      sessionNumber: practiceSession.sessionNumber,
      startedAt: practiceSession.startedAt,
      endedAt: practiceSession.endedAt,
      practiceSeconds: practiceSession.practiceSeconds,
      episodicSummary: practiceSession.episodicSummary,
      memorySnapshot: practiceSession.memorySnapshot,
      clientCaseId: practiceSession.clientCaseId,
      messages: practiceSession.messages,
      scenario: {
        id: practiceSession.scenario.id,
        title: practiceSession.scenario.title,
        contextType: practiceSession.scenario.contextType,
        contextLabel: formatContextType(practiceSession.scenario.contextType),
        dsmCategory: practiceSession.scenario.dsmCategory,
        presentingProblem: practiceSession.scenario.presentingProblem,
        objectives: practiceSession.scenario.objectives,
      },
      caseWriteup,
      review: practiceSession.review,
      stateSnapshots,
    },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const body = await request.json();
  const parsed = reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid review submission" }, { status: 400 });
  }

  const practiceSession = await db.session.findFirst({
    where: { id: sessionId, userId: session.user.id, status: "COMPLETED" },
  });

  if (!practiceSession) {
    return NextResponse.json({ error: "Completed session not found" }, { status: 404 });
  }

  const review = await db.sessionReview.upsert({
    where: { sessionId },
    update: parsed.data,
    create: {
      sessionId,
      ...parsed.data,
    },
  });

  return NextResponse.json({ review });
}
