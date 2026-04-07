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

  // Update channel + config in a transaction
  const channel = await prisma.$transaction(async (tx) => {
    const updated = await tx.channel.update({
      where: { id },
      data,
    });

    // Upsert config entries if provided
    if (Array.isArray(body.config)) {
      for (const entry of body.config) {
        if (!entry.key || !entry.value) continue; // skip empty values to preserve existing secrets
        await tx.channelConfig.upsert({
          where: { channelId_key: { channelId: id, key: entry.key } },
          create: {
            channelId: id,
            key: entry.key,
            value: entry.value,
            isSecret: entry.isSecret ?? false,
          },
          update: {
            value: entry.value,
            isSecret: entry.isSecret ?? undefined,
          },
        });
      }
    }

    return tx.channel.findUniqueOrThrow({
      where: { id },
      include: {
        config: {
          select: { id: true, key: true, value: true, isSecret: true },
        },
      },
    });
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
    // Delete channel WITH all data (messages, conversations, incoming emails)
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { channelId: id } }),
      prisma.conversation.deleteMany({ where: { channelId: id } }),
      prisma.template.updateMany({ where: { channelId: id }, data: { channelId: null } }),
      prisma.channelConfig.deleteMany({ where: { channelId: id } }),
      prisma.incomingEmail.deleteMany({ where: { channelId: id } }),
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
