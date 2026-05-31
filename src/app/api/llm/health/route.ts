import { NextResponse } from "next/server";
import { canAccessSupervisor } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";
import { checkLlmHealth } from "@/lib/llm/health";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSupervisor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await checkLlmHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 502 });
}
