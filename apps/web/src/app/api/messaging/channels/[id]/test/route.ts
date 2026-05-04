import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

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

  if (!channel.isActive) {
    return NextResponse.json(
      { error: "Channel is disabled" },
      { status: 400 },
    );
  }

  // Real liveness check per channel type. Telegram is the only one with a
  // cheap server-side probe right now (`getMe` returns the bot identity).
  // Other types fall back to "channel exists + active".
  if (channel.type === "TELEGRAM") {
    const botToken = channel.config.find((c) => c.key === "bot_token")?.value;
    if (!botToken) {
      return NextResponse.json(
        { error: "Bot token is missing — open settings and paste it again" },
        { status: 400 },
      );
    }
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/getMe`,
      );
      const data = (await res.json()) as {
        ok?: boolean;
        description?: string;
        result?: { username?: string; first_name?: string; id?: number };
      };
      if (!data.ok || !data.result) {
        return NextResponse.json(
          {
            error:
              data.description ||
              "Telegram отклонил bot token — проверьте, что токен от @BotFather введён правильно",
          },
          { status: 400 },
        );
      }
      const handle = data.result.username
        ? `@${data.result.username}`
        : data.result.first_name || "bot";
      // Persist the username so the channel list can label the row with it
      // without re-querying Telegram on every load.
      if (data.result.username) {
        await prisma.channelConfig.upsert({
          where: { channelId_key: { channelId: id, key: "bot_username" } },
          create: {
            channelId: id,
            key: "bot_username",
            value: data.result.username,
          },
          update: { value: data.result.username },
        });
      }

      // Webhook diagnostics — getWebhookInfo is the single best signal for
      // "почему не приходят сообщения". Surface URL + pending count +
      // last_error so the operator can self-diagnose without opening
      // Telegram API in the browser.
      let webhookLine = "";
      try {
        const wRes = await fetch(
          `https://api.telegram.org/bot${botToken}/getWebhookInfo`,
        );
        const wData = (await wRes.json()) as {
          ok?: boolean;
          result?: {
            url?: string;
            pending_update_count?: number;
            last_error_date?: number;
            last_error_message?: string;
            ip_address?: string;
          };
        };
        const w = wData.result;
        if (w) {
          const lines: string[] = [];
          lines.push(`Webhook: ${w.url || "(не зарегистрирован)"}`);
          if (typeof w.pending_update_count === "number") {
            lines.push(`Очередь: ${w.pending_update_count}`);
          }
          if (w.last_error_message) {
            const when = w.last_error_date
              ? new Date(w.last_error_date * 1000).toLocaleString("ru-RU")
              : "?";
            lines.push(`Последняя ошибка (${when}): ${w.last_error_message}`);
          }
          webhookLine = "\n" + lines.join("\n");
        }
      } catch {
        /* non-fatal — keep main test result */
      }

      return NextResponse.json({
        ok: true,
        status: "CONNECTED",
        message: `Бот ${handle} отвечает${webhookLine}`,
        botUsername: data.result.username ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: `Telegram unreachable: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ ok: true, status: "CONNECTED" });
}
