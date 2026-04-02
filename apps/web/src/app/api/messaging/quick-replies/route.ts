import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

export async function GET() {
  const { error } = await authorize(PERMISSIONS.MESSAGING_CONVERSATIONS_READ);
  if (error) return error;

  const quickReplies = await prisma.msgQuickReply.findMany({
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

  const body = await request.json();
  const { shortcut, title, body: qrBody } = body;

  if (!shortcut?.trim() || !title?.trim() || !qrBody?.trim()) {
    return NextResponse.json(
      { error: "shortcut, title, and body are required" },
      { status: 400 },
    );
  }

  const quickReply = await prisma.msgQuickReply.create({
    data: {
      shortcut: shortcut.trim(),
      title: title.trim(),
      body: qrBody.trim(),
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
