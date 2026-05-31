import type { Role } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/** Server-side session with role synced from the database (JWT can be stale after role changes). */
export async function getAuthSession() {
  const session = await auth();
  if (!session?.user) {
    return session;
  }

  const dbUser = session.user.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true },
      })
    : session.user.email
      ? await db.user.findUnique({
          where: { email: session.user.email.toLowerCase() },
          select: { id: true, role: true },
        })
      : null;

  if (dbUser) {
    session.user.id = dbUser.id;
    session.user.role = dbUser.role as Role;
  }

  return session;
}
