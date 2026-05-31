import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { canAccessAdmin } from "@/lib/auth/roles";
import { validateRoleChange } from "@/lib/admin/user-role";
import { ASSIGNABLE_ROLES } from "@/lib/auth/role-labels";
import { db } from "@/lib/db";

const updateRoleSchema = z.object({
  role: z.enum(["STUDENT", "INSTRUCTOR", "ADMIN"]),
});

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  const body = await request.json();
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (!ASSIGNABLE_ROLES.includes(parsed.data.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const validationError = await validateRoleChange({
    actorUserId: session.user.id,
    targetUserId: target.id,
    currentRole: target.role,
    nextRole: parsed.data.role,
  });

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { sessions: true, clientCases: true } },
    },
  });

  return NextResponse.json({ user: updated });
}
