import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessSupervisor } from "@/lib/auth/roles";
import {
  getCaseInsights,
  getLearnerRoster,
  getSessionMonitor,
  getSupervisorAnalytics,
} from "@/lib/supervisor/queries";

async function guardSupervisor() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canAccessSupervisor(session.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const result = await guardSupervisor();
  if ("error" in result && result.error) {
    return result.error;
  }

  const analytics = await getSupervisorAnalytics();
  return NextResponse.json({ analytics });
}
