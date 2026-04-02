import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await authorize(PERMISSIONS.EMAILS_READ);
  if (error) return error;

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

    if (email.companyId !== (session.user.companyId ?? "")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build thread: all items with same customerEmail + productUrl
    let thread = null;
    if (email.customerEmail && email.productUrl) {
      const relatedEmails = await prisma.incomingEmail.findMany({
        where: {
          customerEmail: email.customerEmail,
          productUrl: email.productUrl,
          companyId: session.user.companyId ?? "",
          id: { not: email.id }, // exclude current
        },
        orderBy: { receivedAt: "asc" },
      });

      const allEmailIds = [email.id, ...relatedEmails.map((e) => e.id)];

      const relatedLandings = await prisma.landing.findMany({
        where: { emailId: { in: allEmailIds }, companyId: session.user.companyId ?? "" },
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
  const { session, error } = await authorize(PERMISSIONS.EMAILS_WRITE);
  if (error) return error;

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
    // Verify ownership before update
    const existing = await prisma.incomingEmail.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing || existing.companyId !== (session.user.companyId ?? "")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const email = await prisma.incomingEmail.update({
      where: { id },
      data,
    });

    return NextResponse.json(email);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
