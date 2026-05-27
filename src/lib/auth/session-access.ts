import type { Role } from "@/generated/prisma/client";
import { isSupervisor } from "@/lib/auth/roles";

export function canViewLearnerSession(
  role: Role | undefined,
  viewerUserId: string,
  sessionOwnerUserId: string,
): boolean {
  if (viewerUserId === sessionOwnerUserId) {
    return true;
  }
  return isSupervisor(role);
}

export function canModifyLearnerSession(
  role: Role | undefined,
  viewerUserId: string,
  sessionOwnerUserId: string,
): boolean {
  return viewerUserId === sessionOwnerUserId;
}
