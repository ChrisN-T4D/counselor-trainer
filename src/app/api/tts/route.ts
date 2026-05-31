import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createTtsProvider } from "@/lib/voice/factory";
import {
  listPremadeCatalogVoices,
  resolveClientVoiceIdForScenario,
} from "@/lib/voice/voice-catalog";

function isLibraryVoiceError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("paid_plan_required") ||
    lower.includes("library voices") ||
    lower.includes("upgrade your subscription")
  );
}

function defaultPremadeVoiceId(): string {
  return listPremadeCatalogVoices()[0]?.id ?? "21m00Tcm4TlvDq8ikWAM";
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

  let voiceId = parsed.data.voiceId?.trim();
  if (practiceSession?.scenario) {
    voiceId = resolveClientVoiceIdForScenario(practiceSession.scenario);
  } else if (!voiceId) {
    voiceId = defaultPremadeVoiceId();
  }

  try {
    const tts = createTtsProvider();
    let audio: ArrayBuffer;

    try {
      audio = await tts.synthesize(parsed.data.text, { voiceId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (!isLibraryVoiceError(message)) {
        throw error;
      }

      const fallbackVoiceId = practiceSession?.scenario
        ? resolveClientVoiceIdForScenario(practiceSession.scenario)
        : defaultPremadeVoiceId();

      if (fallbackVoiceId === voiceId) {
        throw error;
      }

      audio = await tts.synthesize(parsed.data.text, { voiceId: fallbackVoiceId });
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
