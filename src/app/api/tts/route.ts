import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createTtsProvider } from "@/lib/voice/factory";
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
): Promise<ArrayBuffer> {
  return tts.synthesize(text, { voiceId });
}

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
  sessionId: z.string().optional(),
  voiceId: z.string().optional(),
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
          },
        },
      },
    });
  }

  let voiceId = resolveVoiceId({
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
    let audio: ArrayBuffer | undefined;
    let lastError: unknown;

    for (const candidate of fallbacks) {
      try {
        audio = await synthesizeWithVoice(tts, parsed.data.text, candidate);
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

    if (!audio) {
      throw lastError ?? new Error("TTS failed for all premade voice fallbacks");
    }
    return new NextResponse(audio, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("TTS error:", error);
    const message = error instanceof Error ? error.message : "TTS provider error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
