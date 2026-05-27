import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessSupervisor } from "@/lib/auth/roles";
import { getLearnerRoster } from "@/lib/supervisor/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessSupervisor(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  const learners = await getLearnerRoster(limit);
  return NextResponse.json({ learners });
}
