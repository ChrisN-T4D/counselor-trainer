import type { Role } from "@/generated/prisma/client";

export function isSupervisor(role: Role | undefined): role is "INSTRUCTOR" | "ADMIN" {
  return role === "INSTRUCTOR" || role === "ADMIN";
}

export function isAdmin(role: Role | undefined): role is "ADMIN" {
  return role === "ADMIN";
}

export function canAccessSupervisor(role: Role | undefined): boolean {
  return isSupervisor(role);
}

export function canAccessAdmin(role: Role | undefined): boolean {
  return isAdmin(role);
}
