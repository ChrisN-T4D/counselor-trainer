import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { canAccessAdmin, canAccessSupervisor } from "@/lib/auth/roles";
import { getAuthSession } from "@/lib/auth/session";

export async function requireSupervisor() {
  const session = await getAuthSession();
  if (!session?.user?.id || !canAccessSupervisor(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireAdmin() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!canAccessAdmin(session.user.role)) {
    redirect("/dashboard?error=admin_access");
  }
  return session;
}

export async function requireRole(allowed: Role[]) {
  const session = await getAuthSession();
  if (!session?.user?.id || !allowed.includes(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}
