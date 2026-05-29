import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessSupervisor } from "@/lib/auth/roles";
import { checkLlmHealth } from "@/lib/llm/health";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSupervisor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await checkLlmHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 502 });
}
