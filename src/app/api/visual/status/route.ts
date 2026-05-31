import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVisualProvider, isVisualEnabled } from "@/lib/visual/factory";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getVisualProvider();
  const visualEnabled = isVisualEnabled();

  return NextResponse.json({
    visualEnabled,
    provider,
    error: visualEnabled ? undefined : "Visual provider is disabled. Set VISUAL_PROVIDER=talkinghead to enable.",
  });
}
