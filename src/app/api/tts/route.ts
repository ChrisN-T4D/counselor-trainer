import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createTtsProvider } from "@/lib/voice/factory";
import type { TtsResult } from "@/lib/voice/tts-provider";
import {
  findParticipantByKey,
  parseParticipantsConfig,
} from "@/lib/sessions/participants";
import {
  DEFAULT_FREE_TIER_VOICE_ID,
  listPremadeCatalogVoices,
  resolveClientVoiceIdForScenario,
} from "@/lib/voice/voice-catalog";

function isLibraryVoiceError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("paid_plan_required") ||
    lower.includes("library voices") ||
    lower.includes("upgrade your subscription") ||
    lower.includes("paid elevenlabs plan")
  );
}

function resolveVoiceId(input: {
  requestedVoiceId?: string;
  scenario?: {
    clientVoiceId: string | null;
    ageGroup: string | null;
    generationSettings: unknown;
  } | null;
}): string {
  if (input.scenario) {
    return resolveClientVoiceIdForScenario(input.scenario);
  }

  const requested = input.requestedVoiceId?.trim();
  if (requested && listPremadeCatalogVoices().some((entry) => entry.id === requested)) {
    return requested;
  }

  return DEFAULT_FREE_TIER_VOICE_ID;
}

async function synthesizeWithVoice(
  tts: ReturnType<typeof createTtsProvider>,
  text: string,
  voiceId: string,
): Promise<TtsResult> {
  if (tts.synthesizeWithTimings) {
    return tts.synthesizeWithTimings(text, { voiceId });
  }
  return { audio: await tts.synthesize(text, { voiceId }) };
}

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  sessionId: z.string().optional(),
  voiceId: z.string().optional(),
  speaker: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = process.env.TTS_PROVIDER ?? "noop";
  if (provider === "noop") {
    return NextResponse.json(
      { error: "TTS is disabled. Set TTS_PROVIDER=elevenlabs in Phase 2." },
      { status: 501 },
    );
  }

  const body = await request.json();
  const parsed = ttsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let practiceSession: {
    scenario: {
      clientVoiceId: string | null;
      ageGroup: string | null;
      generationSettings: unknown;
      participantsConfig: unknown;
    };
  } | null = null;

  if (parsed.data.sessionId) {
    practiceSession = await db.session.findFirst({
      where: { id: parsed.data.sessionId, userId: session.user.id },
      select: {
        scenario: {
          select: {
            clientVoiceId: true,
            ageGroup: true,
            generationSettings: true,
            participantsConfig: true,
          },
        },
      },
    });
  }

  // For couples/family, route the voice to the specific participant who is speaking.
  const participantVoiceId = (() => {
    if (!parsed.data.speaker || !practiceSession) {
      return null;
    }
    const participants = parseParticipantsConfig(practiceSession.scenario.participantsConfig);
    if (!participants) {
      return null;
    }
    return findParticipantByKey(participants, parsed.data.speaker)?.voiceId ?? null;
  })();

  const voiceId =
    participantVoiceId ??
    resolveVoiceId({
      requestedVoiceId: parsed.data.voiceId,
      scenario: practiceSession?.scenario ?? null,
    });

  const fallbacks = [
    voiceId,
    resolveClientVoiceIdForScenario(practiceSession?.scenario ?? {}),
    DEFAULT_FREE_TIER_VOICE_ID,
  ].filter((id, index, all) => all.indexOf(id) === index);

  try {
    const tts = createTtsProvider();
    let result: TtsResult | undefined;
    let lastError: unknown;

    for (const candidate of fallbacks) {
      try {
        result = await synthesizeWithVoice(tts, parsed.data.text, candidate);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : "";
        if (!isLibraryVoiceError(message)) {
          throw error;
        }
      }
    }

    if (!result) {
      throw lastError ?? new Error("TTS failed for all premade voice fallbacks");
    }

    const headers: Record<string, string> = { "Content-Type": "audio/mpeg" };
    if (result.wordTimings && result.wordTimings.words.length > 0) {
      // Base64-encoded so the avatar can lip-sync to precise per-word timing.
      headers["X-Tts-Word-Timings"] = Buffer.from(
        JSON.stringify(result.wordTimings),
        "utf8",
      ).toString("base64");
    }

    return new NextResponse(result.audio, { headers });
  } catch (error) {
    console.error("TTS error:", error);
    const message = error instanceof Error ? error.message : "TTS provider error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
