import Link from "next/link";
import { formatContextType } from "@/lib/scenarios/labels";
import type { ScenarioListItem } from "@/lib/scenarios/types";
import { formatDateTime, formatDuration } from "@/lib/format";

type SessionRow = {
  id: string;
  status: string;
  sessionNumber: number;
  startedAt: Date;
  endedAt: Date | null;
  practiceSeconds: number;
  user: { id: string; name: string; email: string };
  scenario: { title: string; dsmCategory: string; contextType: ScenarioListItem["contextType"] };
  clientCase: { id: string; displayName: string; sessionCount: number } | null;
  _count: { messages: number };
};

export function SessionMonitorTable({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No sessions recorded yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Learner</th>
            <th className="px-4 py-3">Scenario</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Started</th>
            <th className="px-4 py-3">Duration</th>
            <th className="px-4 py-3">Messages</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{item.user.name}</p>
                <p className="text-xs text-slate-500">{item.user.email}</p>
              </td>
              <td className="px-4 py-3">
                <p className="text-slate-900">{item.scenario.title}</p>
                <p className="text-xs text-slate-500">
                  {formatContextType(item.scenario.contextType)} ·{" "}
                  {item.scenario.dsmCategory}
                  {item.sessionNumber > 1 ? ` · Session ${item.sessionNumber}` : ""}
                </p>
              </td>
              <td className="px-4 py-3">
                <span className="text-xs uppercase tracking-wide text-slate-600">
                  {item.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDateTime(item.startedAt)}</td>
              <td className="px-4 py-3 text-slate-600">
                {item.status === "COMPLETED"
                  ? formatDuration(item.practiceSeconds)
                  : "In progress"}
              </td>
              <td className="px-4 py-3 text-slate-600">{item._count.messages}</td>
              <td className="px-4 py-3">
                {item.status === "COMPLETED" ? (
                  <Link
                    href={`/review/${item.id}`}
                    className="text-sm font-medium text-slate-900 underline"
                  >
                    View review
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Active</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
