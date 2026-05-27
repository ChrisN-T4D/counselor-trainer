import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createTtsProvider } from "@/lib/voice/factory";

const ttsSchema = z.object({
  text: z.string().min(1).max(5000),
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

  try {
    const tts = createTtsProvider();
    const audio = await tts.synthesize(parsed.data.text);
    return new NextResponse(audio, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "TTS provider error" }, { status: 502 });
  }
}
