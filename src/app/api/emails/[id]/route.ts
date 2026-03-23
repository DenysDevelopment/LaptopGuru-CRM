import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const email = await prisma.incomingEmail.findUnique({
      where: { id },
      include: {
        landings: {
          include: {
            sentEmails: true,
            video: { select: { title: true, thumbnail: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!email) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build thread: all items with same customerEmail + productUrl
    let thread = null;
    if (email.customerEmail && email.productUrl) {
      const relatedEmails = await prisma.incomingEmail.findMany({
        where: {
          customerEmail: email.customerEmail,
          productUrl: email.productUrl,
          id: { not: email.id }, // exclude current
        },
        orderBy: { receivedAt: "asc" },
      });

      const allEmailIds = [email.id, ...relatedEmails.map((e) => e.id)];

      const relatedLandings = await prisma.landing.findMany({
        where: { emailId: { in: allEmailIds } },
        include: {
          sentEmails: true,
          video: { select: { title: true, thumbnail: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      thread = { emails: relatedEmails, landings: relatedLandings };
    }

    return NextResponse.json({ email, thread });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    "customerName",
    "customerEmail",
    "customerPhone",
    "productUrl",
    "productName",
    "archived",
    "processed",
    "category",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  // Validate email format
  if (data.customerEmail && typeof data.customerEmail === "string") {
    const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(data.customerEmail)) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }
  }

  // Validate URL format
  if (data.productUrl && typeof data.productUrl === "string") {
    try {
      new URL(data.productUrl);
    } catch {
      return NextResponse.json({ error: "Некорректный URL товара" }, { status: 400 });
    }
  }

  if (data.processed === true && !data.processedById) {
    data.processedById = session.user.id;
  }

  try {
    const email = await prisma.incomingEmail.update({
      where: { id },
      data,
    });

    return NextResponse.json(email);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
