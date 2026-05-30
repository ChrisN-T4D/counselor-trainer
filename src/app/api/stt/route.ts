import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createSttProvider } from "@/lib/voice/factory";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = process.env.STT_PROVIDER ?? "noop";
  if (provider === "noop") {
    return NextResponse.json(
      { error: "STT is disabled. Set STT_PROVIDER=elevenlabs in Phase 2." },
      { status: 501 },
    );
  }

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  try {
    const stt = createSttProvider();
    const text = await stt.transcribe(audio);
    return NextResponse.json({ text });
  } catch (error) {
    console.error("STT error:", error);
    const message = error instanceof Error ? error.message : "STT provider error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
