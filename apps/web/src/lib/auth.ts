import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials.email as string;
        const password = credentials.password as string;

        if (!email || !password) return null;

        // Try NestJS API first — get a properly signed API JWT
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(3000),
          });

          if (res.ok) {
            const data = await res.json();
            const accessToken: string = data.accessToken;
            const apiUser = data.user as { id: string; email: string; name: string | null; role: string; companyId: string | null };

            // Fetch extra fields not included in API response
            const user = await prisma.user.findUnique({
              where: { email: apiUser.email },
              select: {
                permissions: true,
                tokenVersion: true,
                company: { select: { name: true } },
              },
            });

            return {
              id: apiUser.id,
              email: apiUser.email,
              name: apiUser.name,
              role: apiUser.role,
              permissions: user?.permissions ?? [],
              companyId: apiUser.companyId,
              companyName: user?.company?.name ?? null,
              tokenVersion: user?.tokenVersion ?? 0,
              accessToken,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any;
          }

          // API returned an error (wrong credentials)
          if (res.status === 401) return null;
        } catch {
          // API unavailable — fall through to direct DB check below
        }

        // Fallback: verify directly against DB (e.g. API not yet started)
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            permissions: true,
            companyId: true,
            tokenVersion: true,
            company: { select: { name: true } },
          },
        });

        if (!user) return null;
        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
          companyId: user.companyId ?? null,
          companyName: user.company?.name ?? null,
          tokenVersion: user.tokenVersion,
          accessToken: undefined, // no API token in fallback mode
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
      },
    }),
  ],
});
