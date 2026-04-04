import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

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
  const { searchParams } = new URL(request.url);
  const deleteData = searchParams.get("deleteData") === "true";

  // Verify channel belongs to the same company
  const existing = await prisma.channel.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  if (deleteData) {
    // Delete channel WITH all messages and conversations
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { channelId: id } }),
      prisma.conversation.deleteMany({ where: { channelId: id } }),
      prisma.template.updateMany({ where: { channelId: id }, data: { channelId: null } }),
      prisma.channelConfig.deleteMany({ where: { channelId: id } }),
      prisma.incomingEmail.updateMany({ where: { channelId: id }, data: { channelId: null } }),
      prisma.channel.delete({ where: { id } }),
    ]);
  } else {
    // Delete only channel, keep messages/conversations (unlink references)
    await prisma.$transaction([
      prisma.message.updateMany({ where: { channelId: id }, data: { channelId: id } }), // keep as-is, handled by schema
      prisma.template.updateMany({ where: { channelId: id }, data: { channelId: null } }),
      prisma.channelConfig.deleteMany({ where: { channelId: id } }),
      prisma.incomingEmail.updateMany({ where: { channelId: id }, data: { channelId: null } }),
    ]);
    // Soft-delete: just deactivate the channel instead of hard-deleting (FK still referenced)
    await prisma.channel.update({ where: { id }, data: { isActive: false, name: `[Удалён] ${existing.name}` } });
  }

  return NextResponse.json({ ok: true });
}
