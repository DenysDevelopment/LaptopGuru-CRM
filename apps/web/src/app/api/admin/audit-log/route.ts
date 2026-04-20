import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.USERS_MANAGE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit")) || 50),
  );
  const entity = url.searchParams.get("entity") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const userId = url.searchParams.get("userId") || undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where = {
    companyId,
    ...(entity ? { entity } : {}),
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total, users, actions, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
    // Users for the filter dropdown and to join user info into the rows below.
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
    }),
    prisma.auditLog
      .findMany({
        where: { companyId },
        select: { action: true },
        distinct: ["action"],
      })
      .then((r) => r.map((x) => x.action).filter(Boolean)),
    prisma.auditLog
      .findMany({
        where: { companyId },
        select: { entity: true },
        distinct: ["entity"],
      })
      .then((r) => r.map((x) => x.entity).filter(Boolean) as string[]),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const enriched = rows.map((r) => ({
    ...r,
    user: r.userId ? userMap.get(r.userId) ?? null : null,
  }));

  return NextResponse.json({
    rows: enriched,
    total,
    page,
    limit,
    filters: {
      users,
      actions,
      entities,
    },
  });
}
