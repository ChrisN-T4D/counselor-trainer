import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ttsProvider = process.env.TTS_PROVIDER ?? "noop";
  const sttProvider = process.env.STT_PROVIDER ?? "noop";

  return NextResponse.json({
    ttsEnabled: ttsProvider !== "noop",
    sttEnabled: sttProvider !== "noop",
  });
}
