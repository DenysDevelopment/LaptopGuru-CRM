import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CHANNELS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { id } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id },
    include: { config: true },
  });

  if (!channel || channel.companyId !== companyId) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // For now, return success if channel exists and is active.
  // Real implementation would test actual connection (IMAP, Telegram bot, etc.)
  if (!channel.isActive) {
    return NextResponse.json(
      { error: "Channel is disabled" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, status: "CONNECTED" });
}
