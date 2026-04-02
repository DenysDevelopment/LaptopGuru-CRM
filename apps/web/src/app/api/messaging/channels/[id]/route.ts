import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CHANNELS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const { id } = await params;

  // Verify channel belongs to the same company
  const existing = await prisma.channel.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.enabled === "boolean") data.isActive = body.enabled;
  if (body.name) data.name = body.name;

  const channel = await prisma.channel.update({
    where: { id },
    data,
    include: {
      config: {
        select: { id: true, key: true, value: true, isSecret: true },
      },
    },
  });

  return NextResponse.json({
    ...channel,
    config: channel.config.map((c) => ({
      ...c,
      value: c.isSecret ? "--------" : c.value,
    })),
  });
}

export async function DELETE(
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

  // Verify channel belongs to the same company
  const existing = await prisma.channel.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Delete config first, then channel
  await prisma.channelConfig.deleteMany({ where: { channelId: id } });
  await prisma.channel.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
