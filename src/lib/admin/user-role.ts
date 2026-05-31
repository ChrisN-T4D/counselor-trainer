import type { Role } from "@/generated/prisma/client";
import { countAdmins } from "@/lib/admin/queries";

export async function validateRoleChange(input: {
  actorUserId: string;
  targetUserId: string;
  currentRole: Role;
  nextRole: Role;
}): Promise<string | null> {
  if (input.currentRole === input.nextRole) {
    return null;
  }

  if (input.currentRole === "ADMIN" && input.nextRole !== "ADMIN") {
    const otherAdmins = await countAdmins(input.targetUserId);
    if (otherAdmins === 0) {
      return "Cannot remove the last admin. Promote another user first.";
    }

    if (input.actorUserId === input.targetUserId) {
      return "You cannot demote yourself while you are the only admin.";
    }
  }

  return null;
}
