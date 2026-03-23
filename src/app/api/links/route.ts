import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const landings = await prisma.landing.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        video: { select: { title: true, thumbnail: true } },
        shortLinks: { select: { code: true, clicks: true } },
        incomingEmail: { select: { customerName: true, customerEmail: true } },
      },
    });

    return NextResponse.json(landings);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
