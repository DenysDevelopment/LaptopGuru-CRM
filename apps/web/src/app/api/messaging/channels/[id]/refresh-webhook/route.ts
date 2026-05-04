import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { publicOriginFromRequest } from "@/lib/public-origin";
import { PERMISSIONS } from "@laptopguru-crm/shared";

/**
 * One-shot button-driven webhook re-registration for Telegram channels.
 * Builds the public URL from the current request (proxy-aware) and tells
 * Telegram to point at it, persisting the new url + secret on success.
 *
 * UI calls this from /settings/channels when the operator notices that
 * inbound updates aren't landing.
 */
export async function POST(
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
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: { config: true },
  });
  if (!channel || channel.companyId !== companyId) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  if (channel.type !== "TELEGRAM") {
    return NextResponse.json(
      { error: "Webhook refresh is supported only for TELEGRAM channels" },
      { status: 400 },
    );
  }

  const botToken = channel.config.find((c) => c.key === "bot_token")?.value;
  if (!botToken) {
    return NextResponse.json(
      { error: "Bot token is missing — configure the channel first" },
      { status: 400 },
    );
  }

  const appUrl = publicOriginFromRequest(request);
  const webhookUrl = `${appUrl}/api/messaging/webhooks/telegram`;
  const webhookSecret = crypto.randomUUID().replace(/-/g, "");

  let tgResult: { ok?: boolean; description?: string } = {};
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: webhookSecret }),
    });
    tgResult = await res.json();
  } catch (err) {
    return NextResponse.json(
      { error: `Telegram unreachable: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }
  if (!tgResult.ok) {
    return NextResponse.json(
      { error: tgResult.description || "Telegram setWebhook failed" },
      { status: 502 },
    );
  }

  await prisma.channelConfig.upsert({
    where: { channelId_key: { channelId: id, key: "webhook_url" } },
    create: { channelId: id, key: "webhook_url", value: webhookUrl },
    update: { value: webhookUrl },
  });
  await prisma.channelConfig.upsert({
    where: { channelId_key: { channelId: id, key: "webhook_secret" } },
    create: { channelId: id, key: "webhook_secret", value: webhookSecret, isSecret: true },
    update: { value: webhookSecret, isSecret: true },
  });

  return NextResponse.json({ ok: true, webhookUrl });
}
