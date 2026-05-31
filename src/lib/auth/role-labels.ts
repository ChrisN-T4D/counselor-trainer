import type { Role } from "@/generated/prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  STUDENT: "Learner",
  INSTRUCTOR: "Supervisor",
  ADMIN: "Admin",
};

export const ASSIGNABLE_ROLES: Role[] = ["STUDENT", "INSTRUCTOR", "ADMIN"];

export function formatRole(role: Role): string {
  return ROLE_LABELS[role];
}
