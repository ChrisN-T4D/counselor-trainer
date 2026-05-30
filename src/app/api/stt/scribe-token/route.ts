import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ELEVENLABS_API_BASE,
  elevenLabsHeaders,
  getElevenLabsApiKey,
  getElevenLabsSttModelId,
} from "@/lib/voice/elevenlabs-config";
import { parseElevenLabsTokenError } from "@/lib/voice/scribe-errors";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sttProvider = process.env.STT_PROVIDER ?? "noop";
  if (sttProvider === "noop") {
    return NextResponse.json({ error: "STT is disabled" }, { status: 501 });
  }

  try {
    const apiKey = getElevenLabsApiKey();
    const response = await fetch(`${ELEVENLABS_API_BASE}/single-use-token/realtime_scribe`, {
      method: "POST",
      headers: elevenLabsHeaders(apiKey),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("ElevenLabs scribe token error:", body);

      return NextResponse.json({ error: parseElevenLabsTokenError(body) }, { status: 502 });
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) {
      return NextResponse.json({ error: "Scribe token missing from provider response" }, { status: 502 });
    }

    return NextResponse.json({
      token: data.token,
      modelId: getElevenLabsSttModelId(),
    });
  } catch (error) {
    console.error("Scribe token error:", error);
    const message = error instanceof Error ? error.message : "Could not create Scribe token";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
