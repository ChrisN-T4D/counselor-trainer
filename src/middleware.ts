import "@/lib/load-auth-env";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { Role } from "@/generated/prisma/client";
import { authConfig } from "@/auth.config";
import { canAccessAdmin, canAccessSupervisor } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/get-public-origin";

const { auth } = NextAuth(authConfig);

const protectedPrefixes = [
  "/dashboard",
  "/scenarios",
  "/practice",
  "/review",
  "/supervisor",
  "/admin",
];

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const isLoggedIn = !!request.auth;
  const origin = getPublicOrigin(request);
  const role = request.auth?.user?.role as Role | undefined;

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/supervisor") && !canAccessSupervisor(role)) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  if (pathname.startsWith("/admin") && !canAccessAdmin(role)) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/scenarios/:path*",
    "/practice/:path*",
    "/review/:path*",
    "/supervisor/:path*",
    "/admin/:path*",
    "/login",
    "/register",
  ],
};
