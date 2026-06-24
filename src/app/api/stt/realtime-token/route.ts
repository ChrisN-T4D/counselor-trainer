import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRealtimeSttConfig } from "@/lib/voice/factory";
import {
  ELEVENLABS_API_BASE,
  getElevenLabsApiKey,
  getElevenLabsSttRealtimeModelId,
} from "@/lib/voice/elevenlabs-config";

export const runtime = "nodejs";

/**
 * Mint a short-lived single-use token so the browser can open the ElevenLabs
 * realtime STT WebSocket directly without ever seeing the API key. This is the
 * vendor-recommended pattern and avoids needing a custom WS server in Next.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getRealtimeSttConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "Realtime STT is disabled. Set STT_REALTIME=elevenlabs to enable." },
      { status: 501 },
    );
  }

  try {
    const apiKey = getElevenLabsApiKey();
    const response = await fetch(`${ELEVENLABS_API_BASE}/single-use-token/realtime_scribe`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to mint realtime STT token: ${response.status} ${detail}`.trim() },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { token?: string };
    if (!data.token) {
      return NextResponse.json({ error: "Realtime STT token response was empty" }, { status: 502 });
    }

    return NextResponse.json({
      token: data.token,
      modelId: getElevenLabsSttRealtimeModelId(),
      baseUri: "wss://api.elevenlabs.io",
    });
  } catch (error) {
    console.error("Realtime STT token error:", error);
    const message = error instanceof Error ? error.message : "Realtime STT token error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
