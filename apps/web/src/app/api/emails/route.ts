import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.EMAILS_READ);
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const filter = searchParams.get("filter") || "all";
  const category = searchParams.get("category");
  const channelId = searchParams.get("channelId");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = 20;

  const where: Prisma.IncomingEmailWhereInput = {
    companyId: session.user.companyId ?? "",
  };

  // Channel filter
  if (channelId) {
    where.channelId = channelId;
  }

  // Status filter
  if (filter === "new") {
    where.processed = false;
    where.archived = false;
  } else if (filter === "processed") {
    where.processed = true;
    where.archived = false;
  } else if (filter === "archived") {
    where.archived = true;
  } else {
    where.archived = false;
  }

  where.category = "lead";

  const [emails, total] = await Promise.all([
    prisma.incomingEmail.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.incomingEmail.count({ where }),
  ]);

  return NextResponse.json({
    emails,
    total,
    page,
    totalPages: Math.ceil(total / perPage),
  });
}
