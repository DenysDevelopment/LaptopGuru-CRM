import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { patchEmailSchema } from "@/lib/schemas/email";
import { validateRequest } from "@/lib/validate-request";

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

  const validation = await validateRequest(request, patchEmailSchema);
  if (!validation.ok) return validation.response;

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(validation.data)) {
    if (value !== undefined) {
      data[key] = value === "" ? null : value;
    }
  }

  if (data.processed === true) {
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
