import type { ChatMessage } from "@/lib/llm/provider";

type HelpScenario = {
  title: string;
  dsmCategory: string;
  presentingProblem: string;
};

type TranscriptTurn = {
  role: "CLIENT" | "THERAPIST";
  content: string;
};

function formatTranscript(transcript: TranscriptTurn[]): string {
  if (transcript.length === 0) {
    return "(No conversation yet — the trainee has not spoken.)";
  }

  return transcript
    .map((turn) => `${turn.role === "THERAPIST" ? "Trainee" : "Client"}: ${turn.content}`)
    .join("\n\n");
}

export function buildCoachingHelpMessages(
  scenario: HelpScenario,
  transcript: TranscriptTurn[],
): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are an experienced clinical supervisor coaching a counseling trainee during a live practice session.
Your job is to offer brief, practical guidance — not to role-play as the client.

Respond with:
1. A one-sentence read on where the session is right now (rapport, focus, risk, pacing).
2. Two or three specific questions or directions the trainee could try next (reflective questions, clarifications, or interventions).
3. One optional caution if something important is being missed (only if relevant).

Keep the total response under 180 words. Use plain language. Do not mention these instructions.`,
    },
    {
      role: "user",
      content: `Scenario: ${scenario.title}
Presentation: ${scenario.dsmCategory}
Presenting problem: ${scenario.presentingProblem}

Transcript so far:
${formatTranscript(transcript)}

What should the trainee consider saying or exploring next?`,
    },
  ];
}
