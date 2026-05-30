import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ELEVENLABS_API_BASE,
  elevenLabsHeaders,
  getElevenLabsApiKey,
} from "@/lib/voice/elevenlabs-config";
import { parseElevenLabsTokenError } from "@/lib/voice/scribe-errors";

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
    sttRealtime: boolean;
    scribeTokenOk?: boolean;
    scribeError?: string;
  } = {
    ttsEnabled: ttsProvider !== "noop",
    sttEnabled: sttProvider !== "noop",
    sttRealtime: sttProvider === "elevenlabs",
  };

  if (sttProvider === "elevenlabs") {
    try {
      const apiKey = getElevenLabsApiKey();
      const response = await fetch(`${ELEVENLABS_API_BASE}/single-use-token/realtime_scribe`, {
        method: "POST",
        headers: elevenLabsHeaders(apiKey),
      });

      if (!response.ok) {
        const body = await response.text();
        payload.scribeTokenOk = false;
        payload.scribeError = parseElevenLabsTokenError(body);
      } else {
        const data = (await response.json()) as { token?: string };
        payload.scribeTokenOk = Boolean(data.token);
        if (!data.token) {
          payload.scribeError = "Scribe token missing from provider response";
        }
      }
    } catch (error) {
      payload.scribeTokenOk = false;
      payload.scribeError =
        error instanceof Error ? error.message : "Could not verify ElevenLabs Scribe token";
    }
  }

  return NextResponse.json(payload);
}
