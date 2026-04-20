import { prisma } from "@/lib/db";

interface AuditEntry {
  userId: string | null;
  companyId: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Fire-and-forget write of a row to AuditLog. Errors are swallowed — an audit
 * write must never cascade into failing the user's action. Callers pass through
 * a best-effort snapshot of the before/after state in `payload`.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        companyId: entry.companyId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        payload: entry.payload as never,
      },
    });
  } catch (e) {
    console.error("[audit] failed to write entry", e);
  }
}
