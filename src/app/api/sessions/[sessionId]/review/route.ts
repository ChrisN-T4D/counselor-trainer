import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isBiopsychosocialWriteup } from "@/lib/scenarios/case-writeup";
import { formatContextType } from "@/lib/scenarios/labels";
import { sanitizeScenarioForActiveSession } from "@/lib/scenarios/public-scenario";

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
    where: { id: sessionId, userId: session.user.id },
    include: {
      scenario: true,
      messages: { orderBy: { sequence: "asc" } },
      review: true,
    },
  });

  if (!practiceSession) {
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

  return NextResponse.json({
    session: {
      id: practiceSession.id,
      status: practiceSession.status,
      startedAt: practiceSession.startedAt,
      endedAt: practiceSession.endedAt,
      practiceSeconds: practiceSession.practiceSeconds,
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
