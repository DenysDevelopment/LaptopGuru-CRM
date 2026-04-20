import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET() {
  const { session, error } = await authorize(PERMISSIONS.LINKS_READ);
  if (error) return error;

  try {
    const landings = await prisma.landing.findMany({
      where: { companyId: session.user.companyId ?? "" },
      orderBy: { createdAt: "desc" },
      include: {
        video: { select: { title: true, thumbnail: true, createdAt: true } },
        shortLinks: { select: { code: true, clicks: true } },
        incomingEmail: { select: { customerName: true, customerEmail: true } },
      },
    });

    return NextResponse.json(landings);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
