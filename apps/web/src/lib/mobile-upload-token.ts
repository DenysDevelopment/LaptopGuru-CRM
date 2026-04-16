import { prisma } from "@/lib/db";
import type { MobileUploadToken } from "@/generated/prisma/client";

export type TokenStatus =
  | { ok: true; token: MobileUploadToken }
  | { ok: false; reason: "not_found" | "expired" | "consumed" };

/**
 * Validate a mobile-upload token: exists, not expired, not consumed.
 * Returns the loaded row on success, or a machine-readable reason on failure.
 */
export async function validateMobileUploadToken(token: string): Promise<TokenStatus> {
  if (!token || typeof token !== "string" || token.length !== 64) {
    return { ok: false, reason: "not_found" };
  }
  const row = await prisma.mobileUploadToken.findUnique({ where: { token } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.consumedAt !== null) return { ok: false, reason: "consumed" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, token: row };
}
