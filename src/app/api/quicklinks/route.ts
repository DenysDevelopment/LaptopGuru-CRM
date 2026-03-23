import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — list all quick links
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const links = await prisma.quickLink.findMany({
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { slug, targetUrl, name } = body;

  if (!slug || !targetUrl) {
    return NextResponse.json({ error: "slug и targetUrl обязательны" }, { status: 400 });
  }

  // Validate slug — only lowercase letters, numbers, hyphens
  if (!/^[a-z0-9\-]+$/.test(slug)) {
    return NextResponse.json({ error: "slug может содержать только a-z, 0-9, -" }, { status: 400 });
  }

  // Validate slug length
  if (slug.length > 50) {
    return NextResponse.json({ error: "slug не может быть длиннее 50 символов" }, { status: 400 });
  }

  // Validate targetUrl format
  try {
    const parsedUrl = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "URL должен начинаться с http:// или https://" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Некорректный URL" }, { status: 400 });
  }

  // Check if slug already exists
  const existing = await prisma.quickLink.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "Такой slug уже занят" }, { status: 409 });
  }

  const link = await prisma.quickLink.create({
    data: {
      slug,
      targetUrl,
      name: name || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(link, { status: 201 });
}

// DELETE — delete quick link
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  // Delete visits first, then link
  try {
    await prisma.quickLinkVisit.deleteMany({ where: { quickLinkId: id } });
    await prisma.quickLink.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
  }
}
