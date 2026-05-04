import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { publicOriginFromRequest } from "@/lib/public-origin";
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

  // Telegram webhook re-registration. Two cases warrant a fresh setWebhook
  // call: (1) bot_token was just changed, or (2) the stored webhook_url
  // points at localhost / 0.0.0.0 (a stale value from a channel that was
  // first created via local dev). Either way, ask Telegram to point at the
  // current public origin and persist the new url + secret.
  if (channel.type === "TELEGRAM") {
    const botToken = channel.config.find((c) => c.key === "bot_token")?.value;
    const storedWebhook = channel.config.find((c) => c.key === "webhook_url")?.value;
    const tokenJustChanged = Array.isArray(body.config)
      ? body.config.some(
          (e: { key?: string; value?: string }) =>
            e.key === "bot_token" && e.value && e.value !== "--------",
        )
      : false;
    const stale =
      !storedWebhook ||
      storedWebhook.includes("localhost") ||
      storedWebhook.includes("0.0.0.0") ||
      storedWebhook.includes("127.0.0.1");
    if (botToken && (tokenJustChanged || stale)) {
      const appUrl = publicOriginFromRequest(request);
      const webhookUrl = `${appUrl}/api/messaging/webhooks/telegram`;
      const webhookSecret = crypto.randomUUID().replace(/-/g, "");
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/setWebhook`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }),
          },
        );
        const result = await res.json();
        if (!result.ok) {
          console.error("[Telegram] setWebhook failed:", result.description);
        } else {
          await prisma.channelConfig.upsert({
            where: { channelId_key: { channelId: id, key: "webhook_url" } },
            create: { channelId: id, key: "webhook_url", value: webhookUrl },
            update: { value: webhookUrl },
          });
          await prisma.channelConfig.upsert({
            where: { channelId_key: { channelId: id, key: "webhook_secret" } },
            create: {
              channelId: id,
              key: "webhook_secret",
              value: webhookSecret,
              isSecret: true,
            },
            update: { value: webhookSecret, isSecret: true },
          });
        }
      } catch (err) {
        console.error("[Telegram] Failed to set webhook:", err);
      }
    }
  }

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
