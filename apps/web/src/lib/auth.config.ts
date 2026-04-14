import type { NextAuthConfig } from "next-auth";
import { ROUTE_PERMISSIONS, hasPermission } from "@laptopguru-crm/shared";
import type { Permission } from "@laptopguru-crm/shared";

/** Public routes that do NOT require authentication */
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/api/auth",
  "/api/domain-check",
  "/l/",
  "/r/",
  "/_next",
  "/favicon",
];

export const authConfig: NextAuthConfig = {
  providers: [], // Configured in auth.ts with Credentials
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === '/';

      if (isPublic) return true;
      if (!isLoggedIn) return false;

      const userRole = (auth?.user as unknown as Record<string, unknown> | undefined)?.role as string | undefined;

      // Redirect SUPER_ADMIN away from regular dashboard to super-admin area
      if (pathname === '/dashboard' && userRole === 'SUPER_ADMIN') {
        return Response.redirect(new URL('/super-admin/dashboard', request.nextUrl));
      }

      // Block non-SUPER_ADMIN from super-admin routes
      if (pathname.startsWith('/super-admin') && userRole !== 'SUPER_ADMIN') {
        return Response.redirect(new URL('/dashboard', request.nextUrl));
      }

      // Dashboard and admin are always accessible
      if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) return true;

      // Check route-level permissions
      const matchedRoute = Object.keys(ROUTE_PERMISSIONS).find((route) =>
        pathname.startsWith(route),
      );

      if (matchedRoute) {
        const user = auth?.user;
        const role = (user as unknown as Record<string, unknown> | undefined)?.role as string | undefined;
        const permissions = (user as unknown as Record<string, unknown> | undefined)?.permissions as string[] | undefined;
        if (!hasPermission(role, permissions, ROUTE_PERMISSIONS[matchedRoute] as Permission)) {
          return Response.redirect(new URL("/dashboard?forbidden=1", request.nextUrl));
        }
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.id = user.id;
        token.role = u.role ?? 'USER';
        token.permissions = u.permissions ?? [];
        token.companyId = u.companyId ?? null;
        token.companyName = u.companyName ?? null;
        token.enabledModules = u.enabledModules ?? [];
        token.tokenVersion = u.tokenVersion ?? 0;
        token.accessToken = u.accessToken as string | undefined;
      }
      return token;
    },
    session({ session, token }) {
      // Token cleared (user deleted) — empty the session so client detects sign-out
      if (!token.id) {
        session.user = undefined as unknown as typeof session.user;
        return session;
      }
      if (session.user) {
        const u = session.user as unknown as Record<string, unknown>;
        session.user.id = token.id as string;
        u.role = token.role as string;
        u.permissions = token.permissions as string[];
        u.companyId = token.companyId as string | null;
        u.companyName = token.companyName as string | null;
        u.enabledModules = token.enabledModules as string[] ?? [];
        u.tokenVersion = token.tokenVersion as number;
        u.accessToken = token.accessToken as string | undefined;
      }
      return session;
    },
  },
};
