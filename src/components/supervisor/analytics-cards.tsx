import { formatHours } from "@/lib/format";

type Analytics = {
  studentCount: number;
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  practiceSeconds: number;
  reviewSeconds: number;
  activeClientCases: number;
  reflectionsSubmitted: number;
};

export function SupervisorAnalyticsCards({ analytics }: { analytics: Analytics }) {
  const cards = [
    { label: "Learners", value: String(analytics.studentCount) },
    { label: "Total sessions", value: String(analytics.totalSessions) },
    { label: "Active sessions", value: String(analytics.activeSessions) },
    { label: "Completed sessions", value: String(analytics.completedSessions) },
    { label: "Practice hours", value: formatHours(analytics.practiceSeconds) },
    { label: "Review hours", value: formatHours(analytics.reviewSeconds) },
    { label: "Active client cases", value: String(analytics.activeClientCases) },
    { label: "Reflections submitted", value: String(analytics.reflectionsSubmitted) },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
