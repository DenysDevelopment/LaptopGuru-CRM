import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseEmail } from "@/lib/parser";
import { prisma } from "@/lib/db";

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  channelId: string;
  companyId: string;
}

function createImapClient(config: ImapConfig) {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: {
      user: config.user,
      pass: config.password,
    },
    logger: false,
  });
}

async function syncChannelEmails(config: ImapConfig): Promise<number> {
  const client = createImapClient(config);
  let imported = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const mailboxStatus = client.mailbox;
      if (!mailboxStatus || mailboxStatus.exists === 0) {
        return 0;
      }

      const messages = client.fetch("1:*", {
        envelope: true,
        source: true,
        uid: true,
      });

      for await (const msg of messages) {
        const messageId = msg.envelope?.messageId;
        if (!messageId) continue;

        const existing = await prisma.incomingEmail.findUnique({
          where: { messageId },
        });
        if (existing) continue;

        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const body = (parsed.html || parsed.textAsHtml || parsed.text || "") as string;

        const extracted = parseEmail(body, subject);

        try {
          await prisma.incomingEmail.create({
            data: {
              messageId,
              from,
              subject,
              body,
              receivedAt: parsed.date || new Date(),
              productUrl: extracted.productUrl,
              productName: extracted.productName,
              customerName: extracted.customerName,
              customerEmail: extracted.customerEmail,
              customerPhone: extracted.customerPhone,
              category: extracted.category,
              channelId: config.channelId,
              companyId: config.companyId,
            },
          });
        } catch (err: unknown) {
          if (err && typeof err === "object" && "code" in err && err.code === "P2002") continue;
          throw err;
        }

        imported++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return imported;
}

/**
 * Sync emails from all active EMAIL channels (from Channel + ChannelConfig).
 */
export async function syncEmails(): Promise<number> {
  const channels = await prisma.channel.findMany({
    where: { type: "EMAIL", isActive: true },
    include: { config: true },
  });

  if (channels.length === 0) {
    return 0;
  }

  let totalImported = 0;

  for (const channel of channels) {
    const config = Object.fromEntries(channel.config.map((c) => [c.key, c.value]));

    const imapHost = config.imap_host;
    const imapPort = config.imap_port || "993";
    const imapUser = config.imap_user;
    const imapPass = config.imap_password;

    if (!imapHost || !imapUser || !imapPass) {
      console.error(`[IMAP sync] Неполная конфигурация для канала "${channel.name}"`);
      continue;
    }

    try {
      const imported = await syncChannelEmails({
        host: imapHost,
        port: Number(imapPort),
        user: imapUser,
        password: imapPass,
        channelId: channel.id,
        companyId: channel.companyId,
      });
      totalImported += imported;
    } catch (err) {
      console.error(`[IMAP sync] Ошибка для канала ${channel.name}:`, err);
    }
  }

  return totalImported;
}
