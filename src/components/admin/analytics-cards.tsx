import { formatHours } from "@/lib/format";

type AdminAnalytics = {
  users: {
    students: number;
    instructors: number;
    admins: number;
    total: number;
  };
  totalSessions: number;
  practiceSeconds: number;
  reviewSeconds: number;
  scenarioCount: number;
  templateCount: number;
  clientCaseCount: number;
};

export function AdminAnalyticsCards({ analytics }: { analytics: AdminAnalytics }) {
  const cards = [
    { label: "Total users", value: String(analytics.users.total) },
    { label: "Learners", value: String(analytics.users.students) },
    { label: "Supervisors", value: String(analytics.users.instructors) },
    { label: "Admins", value: String(analytics.users.admins) },
    { label: "Total sessions", value: String(analytics.totalSessions) },
    { label: "Practice hours", value: formatHours(analytics.practiceSeconds) },
    { label: "Review hours", value: formatHours(analytics.reviewSeconds) },
    { label: "Scenarios", value: String(analytics.scenarioCount) },
    { label: "Templates", value: String(analytics.templateCount) },
    { label: "Client cases", value: String(analytics.clientCaseCount) },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
