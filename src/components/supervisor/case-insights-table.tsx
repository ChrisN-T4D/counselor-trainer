import { formatDateTime } from "@/lib/format";

type CaseRow = {
  id: string;
  displayName: string;
  status: string;
  sessionCount: number;
  lastSessionAt: Date | null;
  learnerName: string;
  scenarioTitle: string;
  dsmCategory: string;
  latestSnapshot: {
    sessionNumber: number | null;
    source: string;
    capturedAt: Date;
    trust: number;
    dropoutRisk: number;
    escalationRisk: number;
  } | null;
};

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
      {label}: {value}
    </span>
  );
}

export function CaseInsightsTable({ cases }: { cases: CaseRow[] }) {
  if (cases.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
        No client cases yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Case</th>
            <th className="px-4 py-3">Learner</th>
            <th className="px-4 py-3">Sessions</th>
            <th className="px-4 py-3">Last session</th>
            <th className="px-4 py-3">Latest state</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((clientCase) => (
            <tr key={clientCase.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{clientCase.displayName}</p>
                <p className="text-xs text-slate-500">
                  {clientCase.scenarioTitle} · {clientCase.dsmCategory}
                </p>
              </td>
              <td className="px-4 py-3 text-slate-600">{clientCase.learnerName}</td>
              <td className="px-4 py-3 text-slate-600">{clientCase.sessionCount}</td>
              <td className="px-4 py-3 text-slate-600">
                {formatDateTime(clientCase.lastSessionAt)}
              </td>
              <td className="px-4 py-3">
                {clientCase.latestSnapshot ? (
                  <div className="flex flex-wrap gap-1">
                    <MetricPill label="Trust" value={clientCase.latestSnapshot.trust} />
                    <MetricPill
                      label="Dropout"
                      value={clientCase.latestSnapshot.dropoutRisk}
                    />
                    <MetricPill
                      label="Escalation"
                      value={clientCase.latestSnapshot.escalationRisk}
                    />
                    <p className="w-full text-xs text-slate-500">
                      Snapshot session {clientCase.latestSnapshot.sessionNumber ?? "?"} ·{" "}
                      {formatDateTime(clientCase.latestSnapshot.capturedAt)}
                    </p>
                  </div>
                ) : (
                  <span className="text-slate-400">No snapshots</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
