"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  BIOPSYCHOSOCIAL_SECTIONS,
  type BiopsychosocialWriteup,
} from "@/lib/scenarios/case-writeup";

type Message = {
  id: string;
  role: "CLIENT" | "THERAPIST" | "SYSTEM";
  content: string;
  sequence: number;
};

type RelationshipSnapshot = {
  trust: number;
  openness: number;
  alliance: number;
  resistance: number;
  deception: number;
  dropoutRisk: number;
};

type SafetySnapshot = {
  siLevel: string;
  hiLevel: string;
  escalationRisk: number;
  selfHarmRisk: number;
  substanceUseSeverity: number;
  immediateSafetyConcern: boolean;
};

type StateSnapshot = {
  id: string;
  sessionNumber: number | null;
  source: string;
  relationship: RelationshipSnapshot;
  safety: SafetySnapshot;
  rationale: string | null;
};

type ReviewData = {
  session: {
    id: string;
    status: string;
    sessionNumber: number;
    clientCaseId: string | null;
    episodicSummary: string | null;
    practiceSeconds: number;
    messages: Message[];
    scenario: {
      title: string;
      contextLabel: string;
      dsmCategory: string;
      presentingProblem: string;
      objectives: string[];
    };
    caseWriteup: BiopsychosocialWriteup | null;
    review: {
      learnerConclusions: string | null;
      learnerWhatILearned: string | null;
      learnerInterventionRationale: string | null;
    } | null;
    stateSnapshots: StateSnapshot[];
  };
};

function MetricBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-200">
        <div
          className="h-2 rounded-full bg-slate-700"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export function SessionReviewPanel({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [learnerConclusions, setLearnerConclusions] = useState("");
  const [learnerWhatILearned, setLearnerWhatILearned] = useState("");
  const [learnerInterventionRationale, setLearnerInterventionRationale] = useState("");

  useEffect(() => {
    async function loadReview() {
      const response = await fetch(`/api/sessions/${sessionId}/review`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not load session review");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as ReviewData;
      setData(payload);
      setLearnerConclusions(payload.session.review?.learnerConclusions ?? "");
      setLearnerWhatILearned(payload.session.review?.learnerWhatILearned ?? "");
      setLearnerInterventionRationale(
        payload.session.review?.learnerInterventionRationale ?? "",
      );
      setLoading(false);
    }

    loadReview();
  }, [sessionId]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMessage(null);

    const response = await fetch(`/api/sessions/${sessionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learnerConclusions,
        learnerWhatILearned,
        learnerInterventionRationale,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? "Failed to save reflection");
      setSaving(false);
      return;
    }

    setSavedMessage("Reflection saved.");
    setSaving(false);
  }

  if (loading) {
    return <p className="text-slate-600">Loading session review...</p>;
  }

  if (!data) {
    return <p className="text-red-600">{error ?? "Review not found"}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Session review</h1>
        <p className="mt-1 text-slate-600">
          {data.session.scenario.title} · {data.session.scenario.contextLabel}
          {data.session.sessionNumber > 1 ? ` · Session ${data.session.sessionNumber}` : ""}
        </p>
      </div>

      {data.session.episodicSummary && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Session memory summary</h2>
          <p className="mt-2 text-sm text-slate-700">{data.session.episodicSummary}</p>
        </section>
      )}

      {data.session.stateSnapshots.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Relationship & safety trends</h2>
          <p className="mt-1 text-sm text-slate-600">
            State captured across sessions for this client case.
          </p>
          <div className="mt-4 space-y-6">
            {data.session.stateSnapshots.map((snapshot) => (
              <article key={snapshot.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-800">
                  {snapshot.source === "CASE_INIT"
                    ? "Initial case state"
                    : `After session ${snapshot.sessionNumber ?? "?"}`}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MetricBar label="Trust" value={snapshot.relationship.trust} />
                  <MetricBar label="Openness" value={snapshot.relationship.openness} />
                  <MetricBar label="Alliance" value={snapshot.relationship.alliance} />
                  <MetricBar label="Resistance" value={snapshot.relationship.resistance} />
                  <MetricBar label="Deception" value={snapshot.relationship.deception} />
                  <MetricBar label="Dropout risk" value={snapshot.relationship.dropoutRisk} />
                  <MetricBar label="Escalation risk" value={snapshot.safety.escalationRisk} />
                  <MetricBar label="Self-harm risk" value={snapshot.safety.selfHarmRisk} />
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  SI: {snapshot.safety.siLevel} · HI: {snapshot.safety.hiLevel}
                  {snapshot.safety.immediateSafetyConcern ? " · immediate concern flagged" : ""}
                </p>
                {snapshot.rationale && (
                  <p className="mt-2 text-xs text-slate-500">{snapshot.rationale}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Session transcript</h2>
        <div className="mt-4 space-y-3">
          {data.session.messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                message.role === "THERAPIST"
                  ? "ml-auto bg-slate-900 text-white"
                  : "bg-slate-50 text-slate-900"
              }`}
            >
              <p className="mb-1 text-xs font-medium opacity-70">
                {message.role === "THERAPIST" ? "You (Therapist)" : "Client"}
              </p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
        </div>
      </section>

      {data.session.caseWriteup && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Revealed biopsychosocial case write-up
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            This hidden prompt context is now available for debrief and comparison.
          </p>
          <div className="mt-4 space-y-4">
            {BIOPSYCHOSOCIAL_SECTIONS.map(({ key, label }) => (
              <article key={key}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  {label}
                </h3>
                <p className="mt-1 text-sm text-slate-800">{data.session.caseWriteup![key]}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Your reflection</h2>
        <p className="mt-1 text-sm text-slate-600">
          Compare your conclusions with the revealed case write-up above.
        </p>
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              What conclusions did you draw during the session?
            </span>
            <textarea
              value={learnerConclusions}
              onChange={(event) => setLearnerConclusions(event.target.value)}
              rows={4}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              What did you learn from this session?
            </span>
            <textarea
              value={learnerWhatILearned}
              onChange={(event) => setLearnerWhatILearned(event.target.value)}
              rows={4}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Why did you choose your interventions?
            </span>
            <textarea
              value={learnerInterventionRationale}
              onChange={(event) => setLearnerInterventionRationale(event.target.value)}
              rows={4}
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save reflection"}
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Comparison snapshot</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-md bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Your conclusions</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {learnerConclusions || "Not submitted yet."}
            </p>
          </article>
          <article className="rounded-md bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Original case intent</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {data.session.caseWriteup?.workingHypotheses ??
                data.session.scenario.presentingProblem}
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {data.session.scenario.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <div className="flex flex-wrap gap-4">
        <Link href="/dashboard" className="text-sm font-medium text-slate-900 underline">
          Back to dashboard
        </Link>
        {data.session.clientCaseId && (
          <Link
            href="/dashboard"
            className="text-sm font-medium text-slate-900 underline"
          >
            Continue this case from My Cases
          </Link>
        )}
      </div>

      {savedMessage && <p className="text-sm text-green-700">{savedMessage}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
