import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/client";
import { canAccessAdmin, canAccessSupervisor } from "@/lib/auth/roles";

export async function requireSupervisor() {
  const session = await auth();
  if (!session?.user?.id || !canAccessSupervisor(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !canAccessAdmin(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}

export async function requireRole(allowed: Role[]) {
  const session = await auth();
  if (!session?.user?.id || !allowed.includes(session.user.role)) {
    redirect("/dashboard");
  }
  return session;
}
