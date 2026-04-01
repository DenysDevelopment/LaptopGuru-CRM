import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

/**
 * POST /api/admin/seed-email-channel
 * Creates an EMAIL channel from current IMAP/SMTP environment variables.
 * Only for ADMIN / messaging:channels:write.
 */
export async function POST() {
  const { session, error } = await authorize(PERMISSIONS.MESSAGING_CHANNELS_WRITE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company assigned" }, { status: 403 });
  }

  const env = process.env;

  const imapHost = env.IMAP_HOST;
  const smtpHost = env.SMTP_HOST;

  if (!imapHost || !smtpHost) {
    return NextResponse.json(
      { error: "IMAP_HOST и SMTP_HOST не настроены в env" },
      { status: 400 },
    );
  }

  // Check if email channel already exists
  const existing = await prisma.channel.findFirst({
    where: { type: "EMAIL", companyId },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Email канал уже существует", channelId: existing.id },
      { status: 409 },
    );
  }

  // Create channel + config from env vars
  const channel = await prisma.channel.create({
    data: {
      name: env.SMTP_FROM || "Email",
      type: "EMAIL",
      isActive: true,
      companyId,
      config: {
        create: [
          { key: "imap_host", value: env.IMAP_HOST || "" },
          { key: "imap_port", value: env.IMAP_PORT || "993" },
          { key: "imap_user", value: env.IMAP_USER || "", isSecret: false },
          { key: "imap_password", value: env.IMAP_PASSWORD || "", isSecret: true },
          { key: "smtp_host", value: env.SMTP_HOST || "" },
          { key: "smtp_port", value: env.SMTP_PORT || "587" },
          { key: "smtp_user", value: env.SMTP_USER || "", isSecret: false },
          { key: "smtp_password", value: env.SMTP_PASSWORD || "", isSecret: true },
          { key: "smtp_from", value: env.SMTP_FROM || "" },
        ],
      },
    },
    include: { config: { select: { key: true, isSecret: true } } },
  });

  return NextResponse.json({
    ok: true,
    channelId: channel.id,
    name: channel.name,
    configKeys: channel.config.map((c) => c.key),
  });
}
