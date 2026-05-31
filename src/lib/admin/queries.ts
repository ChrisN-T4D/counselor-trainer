import { db } from "@/lib/db";

export async function getAdminAnalytics() {
  const [userCounts, sessionTotals, scenarioCount, templateCount, clientCaseCount] =
    await Promise.all([
      db.user.groupBy({
        by: ["role"],
        _count: true,
      }),
      db.session.aggregate({
        _sum: { practiceSeconds: true, reviewSeconds: true },
        _count: true,
      }),
      db.scenario.count(),
      db.scenario.count({ where: { isTemplate: true } }),
      db.clientCase.count(),
    ]);

  const usersByRole = Object.fromEntries(
    userCounts.map((row) => [row.role, row._count]),
  ) as Record<string, number>;

  return {
    users: {
      students: usersByRole.STUDENT ?? 0,
      instructors: usersByRole.INSTRUCTOR ?? 0,
      admins: usersByRole.ADMIN ?? 0,
      total:
        (usersByRole.STUDENT ?? 0) +
        (usersByRole.INSTRUCTOR ?? 0) +
        (usersByRole.ADMIN ?? 0),
    },
    totalSessions: sessionTotals._count,
    practiceSeconds: sessionTotals._sum.practiceSeconds ?? 0,
    reviewSeconds: sessionTotals._sum.reviewSeconds ?? 0,
    scenarioCount,
    templateCount,
    clientCaseCount,
  };
}

export async function getAdminScenarios() {
  return db.scenario.findMany({
    orderBy: [{ isTemplate: "desc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      contextType: true,
      dsmCategory: true,
      difficulty: true,
      acuityLevel: true,
      isTemplate: true,
      _count: { select: { sessions: true, clientCases: true } },
    },
  });
}

export async function getAdminUsers() {
  return db.user.findMany({
    orderBy: [{ role: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { sessions: true, clientCases: true } },
    },
  });
}

export async function countAdmins(excludeUserId?: string) {
  return db.user.count({
    where: {
      role: "ADMIN",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}
