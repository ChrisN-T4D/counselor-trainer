import type { Role } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/** Server-side session with role synced from the database (JWT can be stale after role changes). */
export async function getAuthSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return session;
  }

  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  if (dbUser) {
    session.user.role = dbUser.role as Role;
  }

  return session;
}
