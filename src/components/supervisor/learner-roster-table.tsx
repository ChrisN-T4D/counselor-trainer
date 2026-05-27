import { formatDateTime } from "@/lib/format";

type LearnerRow = {
  id: string;
  name: string;
  email: string;
  joinedAt: Date;
  totalSessions: number;
  completedSessions: number;
  activeCases: number;
  lastSession: {
    id: string;
    status: string;
    startedAt: Date;
    scenario: { title: string };
  } | null;
};

export function LearnerRosterTable({ learners }: { learners: LearnerRow[] }) {
  if (learners.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No learners registered yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Learner</th>
            <th className="px-4 py-3">Joined</th>
            <th className="px-4 py-3">Sessions</th>
            <th className="px-4 py-3">Completed</th>
            <th className="px-4 py-3">Cases</th>
            <th className="px-4 py-3">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {learners.map((learner) => (
            <tr key={learner.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{learner.name}</p>
                <p className="text-xs text-slate-500">{learner.email}</p>
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDateTime(learner.joinedAt)}</td>
              <td className="px-4 py-3 text-slate-600">{learner.totalSessions}</td>
              <td className="px-4 py-3 text-slate-600">{learner.completedSessions}</td>
              <td className="px-4 py-3 text-slate-600">{learner.activeCases}</td>
              <td className="px-4 py-3 text-slate-600">
                {learner.lastSession ? (
                  <>
                    <p>{learner.lastSession.scenario.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(learner.lastSession.startedAt)} ·{" "}
                      {learner.lastSession.status}
                    </p>
                  </>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
