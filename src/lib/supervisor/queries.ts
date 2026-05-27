import { db } from "@/lib/db";
import { parseStoredRelationshipState, parseStoredSafetyState } from "@/lib/memory/case-init";

export async function getSupervisorAnalytics() {
  const [
    studentCount,
    sessionTotals,
    activeSessions,
    completedSessions,
    clientCaseCount,
    reviewCount,
  ] = await Promise.all([
    db.user.count({ where: { role: "STUDENT" } }),
    db.session.aggregate({
      _sum: { practiceSeconds: true, reviewSeconds: true },
      _count: true,
    }),
    db.session.count({ where: { status: "ACTIVE" } }),
    db.session.count({ where: { status: "COMPLETED" } }),
    db.clientCase.count({ where: { status: "ACTIVE" } }),
    db.sessionReview.count(),
  ]);

  return {
    studentCount,
    totalSessions: sessionTotals._count,
    activeSessions,
    completedSessions,
    practiceSeconds: sessionTotals._sum.practiceSeconds ?? 0,
    reviewSeconds: sessionTotals._sum.reviewSeconds ?? 0,
    activeClientCases: clientCaseCount,
    reflectionsSubmitted: reviewCount,
  };
}

export async function getLearnerRoster(limit = 50) {
  const learners = await db.user.findMany({
    where: { role: "STUDENT" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          sessions: true,
          clientCases: true,
        },
      },
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          startedAt: true,
          scenario: { select: { title: true } },
        },
      },
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  const completedByUser = await db.session.groupBy({
    by: ["userId"],
    where: { status: "COMPLETED" },
    _count: true,
  });
  const completedMap = new Map(completedByUser.map((row) => [row.userId, row._count]));

  return learners.map((learner) => ({
    id: learner.id,
    name: learner.name,
    email: learner.email,
    joinedAt: learner.createdAt,
    totalSessions: learner._count.sessions,
    completedSessions: completedMap.get(learner.id) ?? 0,
    activeCases: learner._count.clientCases,
    lastSession: learner.sessions[0] ?? null,
  }));
}

export async function getSessionMonitor(limit = 30) {
  return db.session.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      sessionNumber: true,
      startedAt: true,
      endedAt: true,
      practiceSeconds: true,
      user: { select: { id: true, name: true, email: true } },
      scenario: { select: { title: true, dsmCategory: true, contextType: true } },
      clientCase: { select: { id: true, displayName: true, sessionCount: true } },
      _count: { select: { messages: true } },
    },
  });
}

export async function getCaseInsights(limit = 20) {
  const cases = await db.clientCase.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, name: true } },
      scenario: { select: { title: true, dsmCategory: true } },
      stateSnapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: {
          sessionNumber: true,
          source: true,
          relationship: true,
          safety: true,
          capturedAt: true,
        },
      },
    },
  });

  return cases.map((clientCase) => {
    const latest = clientCase.stateSnapshots[0];
    let trust = 0;
    let escalationRisk = 0;
    let dropoutRisk = 0;

    if (latest) {
      try {
        const relationship = parseStoredRelationshipState(latest.relationship);
        const safety = parseStoredSafetyState(latest.safety);
        trust = relationship.trust;
        dropoutRisk = relationship.dropoutRisk;
        escalationRisk = safety.escalationRisk;
      } catch {
        // ignore malformed snapshot
      }
    }

    return {
      id: clientCase.id,
      displayName: clientCase.displayName,
      status: clientCase.status,
      sessionCount: clientCase.sessionCount,
      lastSessionAt: clientCase.lastSessionAt,
      learnerName: clientCase.user.name,
      scenarioTitle: clientCase.scenario.title,
      dsmCategory: clientCase.scenario.dsmCategory,
      latestSnapshot: latest
        ? {
            sessionNumber: latest.sessionNumber,
            source: latest.source,
            capturedAt: latest.capturedAt,
            trust,
            dropoutRisk,
            escalationRisk,
          }
        : null,
    };
  });
}
