import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { quickReplySchema } from "@/lib/schemas/quick-reply";
import { validateRequest } from "@/lib/validate-request";

export async function GET() {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_READ);
  if (error) return error;

  const quickReplies = await prisma.msgQuickReply.findMany({
    where: { companyId: session.user.companyId ?? "" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    quickReplies.map((qr) => ({
      id: qr.id,
      shortcut: qr.shortcut,
      title: qr.title,
      body: qr.body,
      createdAt: qr.createdAt,
    })),
  );
}

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_TEMPLATES_WRITE);
  if (error) return error;

  const validation = await validateRequest(request, quickReplySchema);
  if (!validation.ok) return validation.response;
  const { shortcut, title, body: qrBody } = validation.data;

  const quickReply = await prisma.msgQuickReply.create({
    data: {
      shortcut,
      title,
      body: qrBody,
      createdBy: session.user!.id,
      companyId: session.user!.companyId ?? "",
    },
  });

  return NextResponse.json(
    {
      id: quickReply.id,
      shortcut: quickReply.shortcut,
      title: quickReply.title,
      body: quickReply.body,
      createdAt: quickReply.createdAt,
    },
    { status: 201 },
  );
}
