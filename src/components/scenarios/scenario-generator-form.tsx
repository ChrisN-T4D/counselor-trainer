"use client";

import { useMemo, useState } from "react";
import type { ScenarioListItem } from "@/lib/scenarios/types";

const CONTEXT_OPTIONS = [
  { value: "MEDICAL_FAMILY_THERAPY", label: "Medical family therapy (hospital referral)" },
  { value: "DOCTOR_HANDOFF", label: "In-doctor visit handoff" },
  { value: "PEDIATRIC_PARENT_CHILD", label: "Pediatric (parent + child)" },
  { value: "INDIVIDUAL", label: "Individual session" },
  { value: "COUPLES", label: "Couples session" },
  { value: "FAMILY", label: "Family session" },
] as const;

const PARTICIPANTS_BY_CONTEXT: Record<
  ScenarioListItem["contextType"],
  string[]
> = {
  MEDICAL_FAMILY_THERAPY: ["client", "partner", "caregiver"],
  DOCTOR_HANDOFF: ["client", "physician"],
  PEDIATRIC_PARENT_CHILD: ["child", "parent", "caregiver"],
  INDIVIDUAL: ["client"],
  COUPLES: ["partner_a", "partner_b"],
  FAMILY: ["adolescent", "caregiver_1", "caregiver_2", "sibling"],
};

type Props = {
  onGenerated: (scenario: ScenarioListItem) => void;
};

type GenerationStage = "drafting" | "parsing" | "saving";

function stageLabel(stage: GenerationStage | null) {
  switch (stage) {
    case "drafting":
      return "Writing detailed case material…";
    case "parsing":
      return "Validating scenario structure…";
    case "saving":
      return "Saving scenario…";
    default:
      return "Starting generation…";
  }
}

async function readGenerationStream(
  response: Response,
  onProgress: (percent: number, stage: GenerationStage) => void,
): Promise<ScenarioListItem> {
  if (!response.body) {
    throw new Error("No response body from server");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let scenario: ScenarioListItem | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      const event = JSON.parse(line) as
        | { type: "progress"; percent: number; stage: GenerationStage }
        | { type: "complete"; scenario: ScenarioListItem }
        | { type: "error"; error: string };

      if (event.type === "progress") {
        onProgress(event.percent, event.stage);
      } else if (event.type === "complete") {
        onProgress(100, "saving");
        scenario = event.scenario;
      } else if (event.type === "error") {
        streamError = event.error;
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }

  if (!scenario) {
    throw new Error("Generation finished without a scenario");
  }

  return scenario;
}

export function ScenarioGeneratorForm({ onGenerated }: Props) {
  const [contextType, setContextType] =
    useState<ScenarioListItem["contextType"]>("INDIVIDUAL");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(
    "beginner",
  );
  const [ageGroup, setAgeGroup] = useState<
    "child" | "adolescent" | "adult" | "older_adult"
  >("adult");
  const [referralSource, setReferralSource] = useState<
    "doctor" | "self" | "school" | "family" | "other"
  >("self");
  const [symptomSeverity, setSymptomSeverity] = useState(3);
  const [clientResistance, setClientResistance] = useState(2);
  const [sessionUrgency, setSessionUrgency] = useState(3);
  const [focusAreas, setFocusAreas] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<GenerationStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const participants = useMemo(
    () => PARTICIPANTS_BY_CONTEXT[contextType],
    [contextType],
  );

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setProgress(0);
    setStage(null);
    setError(null);

    try {
      const response = await fetch("/api/scenarios/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextType,
          difficulty,
          ageGroup,
          referralSource,
          symptomSeverity,
          clientResistance,
          sessionUrgency,
          participants,
          focusAreas: focusAreas
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Failed to generate scenario");
        return;
      }

      const scenario = await readGenerationStream(response, (percent, nextStage) => {
        setProgress(percent);
        setStage(nextStage);
      });
      onGenerated(scenario);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Could not reach the server. Please try again.",
      );
    } finally {
      setLoading(false);
      setStage(null);
    }
  }

  return (
    <form
      onSubmit={handleGenerate}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-slate-900">Create custom scenario</h2>
      <p className="mt-1 text-sm text-slate-600">
        Generate a hidden biopsychosocial case write-up for practice. The full write-up
        is revealed only after session completion.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Counseling context</span>
          <select
            value={contextType}
            onChange={(event) =>
              setContextType(event.target.value as ScenarioListItem["contextType"])
            }
            className="field-input"
          >
            {CONTEXT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Difficulty</span>
          <select
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value as "beginner" | "intermediate" | "advanced")
            }
            className="field-input"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Age group</span>
          <select
            value={ageGroup}
            onChange={(event) =>
              setAgeGroup(
                event.target.value as "child" | "adolescent" | "adult" | "older_adult",
              )
            }
            className="field-input"
          >
            <option value="child">Child</option>
            <option value="adolescent">Adolescent</option>
            <option value="adult">Adult</option>
            <option value="older_adult">Older adult</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Referral source</span>
          <select
            value={referralSource}
            onChange={(event) =>
              setReferralSource(
                event.target.value as "doctor" | "self" | "school" | "family" | "other",
              )
            }
            className="field-input"
          >
            <option value="doctor">Doctor</option>
            <option value="self">Self</option>
            <option value="school">School</option>
            <option value="family">Family</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Symptom severity ({symptomSeverity})
          </span>
          <input
            type="range"
            min={1}
            max={5}
            value={symptomSeverity}
            onChange={(event) => setSymptomSeverity(Number(event.target.value))}
            className="w-full"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Client resistance ({clientResistance})
          </span>
          <input
            type="range"
            min={1}
            max={5}
            value={clientResistance}
            onChange={(event) => setClientResistance(Number(event.target.value))}
            className="w-full"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Session urgency ({sessionUrgency})
          </span>
          <input
            type="range"
            min={1}
            max={5}
            value={sessionUrgency}
            onChange={(event) => setSessionUrgency(Number(event.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-slate-700">
          Focus areas (optional, comma-separated)
        </span>
        <input
          type="text"
          value={focusAreas}
          onChange={(event) => setFocusAreas(event.target.value)}
          placeholder="safety screening, family systems, motivational interviewing"
          className="field-input"
        />
      </label>

      <p className="mt-3 text-xs text-slate-500">
        Participants for this context: {participants.join(", ")}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Detailed scenarios can take several minutes on slower models. Progress is estimated from
        output length — there is no hard time limit.
      </p>

      {loading && (
        <div className="mt-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-800">{stageLabel(stage)}</span>
            <span className="tabular-nums text-slate-600">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Estimated progress — generation continues until the model finishes.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Generating scenario…" : "Generate scenario"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}
