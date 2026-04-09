import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { createQuickLinkSchema } from "@/lib/schemas/quicklink";
import { validateRequest } from "@/lib/validate-request";

// GET — list all quick links
export async function GET() {
  const { session, error } = await authorize(PERMISSIONS.QUICKLINKS_READ);
  if (error) return error;

  const links = await prisma.quickLink.findMany({
    where: { companyId: session.user.companyId ?? "" },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { visits: true } },
      visits: {
        orderBy: { visitedAt: "desc" },
        take: 50,
        select: {
          id: true,
          visitedAt: true,
          ip: true,
          country: true,
          city: true,
          browser: true,
          os: true,
          deviceType: true,
          referrerDomain: true,
        },
      },
    },
  });

  return NextResponse.json(links);
}

// POST — create quick link
export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.QUICKLINKS_WRITE);
  if (error) return error;

  const validation = await validateRequest(request, createQuickLinkSchema);
  if (!validation.ok) return validation.response;
  const { slug, targetUrl, name } = validation.data;

  // Check if slug already exists
  const existing = await prisma.quickLink.findFirst({ where: { slug, companyId: session.user.companyId ?? "" } });
  if (existing) {
    return NextResponse.json({ error: "Такой slug уже занят" }, { status: 409 });
  }

  const link = await prisma.quickLink.create({
    data: {
      slug,
      targetUrl,
      name: name || null,
      userId: session.user.id,
      companyId: session.user.companyId ?? "",
    },
  });

  return NextResponse.json(link, { status: 201 });
}

// DELETE — delete quick link
export async function DELETE(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.QUICKLINKS_WRITE);
  if (error) return error;

  const body = await request.json();
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  // Verify ownership (admin can delete any, user only their own)
  const link = await prisma.quickLink.findUnique({ where: { id } });
  if (!link || link.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Ссылка не найдена" }, { status: 404 });
  }
  if (session.user.role !== "ADMIN" && link.userId !== session.user.id) {
    return NextResponse.json({ error: "Нет прав на удаление этой ссылки" }, { status: 403 });
  }

  // Delete visits first, then link
  try {
    await prisma.quickLinkVisit.deleteMany({ where: { quickLinkId: id } });
    await prisma.quickLink.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
