import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    permissions: string[];
    companyId: string | null;
    tokenVersion: number;
    impersonating?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      permissions: string[];
      companyId: string | null;
      companyName: string | null;
      tokenVersion: number;
      impersonating?: boolean;
      accessToken?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    permissions: string[];
    companyId: string | null;
    companyName: string | null;
    tokenVersion: number;
    impersonating?: boolean;
    accessToken?: string;
  }
}
