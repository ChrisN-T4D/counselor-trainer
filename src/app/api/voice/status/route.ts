import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getElevenLabsApiKey } from "@/lib/voice/elevenlabs-config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ttsProvider = process.env.TTS_PROVIDER ?? "noop";
  const sttProvider = process.env.STT_PROVIDER ?? "noop";

  const payload: {
    ttsEnabled: boolean;
    sttEnabled: boolean;
    ttsError?: string;
    sttError?: string;
  } = {
    ttsEnabled: ttsProvider !== "noop",
    sttEnabled: sttProvider !== "noop",
  };

  if (ttsProvider === "elevenlabs" || sttProvider === "elevenlabs") {
    try {
      getElevenLabsApiKey();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ELEVENLABS_API_KEY is not set on the server";
      if (ttsProvider === "elevenlabs") {
        payload.ttsError = message;
      }
      if (sttProvider === "elevenlabs") {
        payload.sttError = message;
      }
    }
  }

  return NextResponse.json(payload);
}
