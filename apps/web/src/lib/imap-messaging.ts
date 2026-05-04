import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { buildConversationSummary } from "@/lib/messaging/conversation-summary";
import { parseEmail } from "@/lib/parser";
import fs from "fs";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_ATTACHMENTS_PER_EMAIL = 10;

/**
 * Sync emails from IMAP into the messaging system (Contact → Conversation → Message).
 * Iterates over ALL active EMAIL channels from DB.
 */
export async function syncEmailsToMessaging(): Promise<number> {
  // Find ALL active EMAIL channels
  const channels = await prisma.channel.findMany({
    where: { type: "EMAIL", isActive: true },
    include: { config: true },
  });

  if (channels.length === 0) {
    console.warn("[Email Sync] No active EMAIL channels found");
    return 0;
  }

  let totalImported = 0;

  for (const channel of channels) {
    const imported = await syncSingleChannel(channel);
    totalImported += imported;
  }

  return totalImported;
}

async function syncSingleChannel(
  channel: Awaited<ReturnType<typeof prisma.channel.findFirst<{ include: { config: true } }>>> & { config: { key: string; value: string }[] },
): Promise<number> {
  const config = Object.fromEntries(channel.config.map((c) => [c.key, c.value]));

  const imapHost = config.imap_host;
  const imapPort = config.imap_port || "993";
  const imapUser = config.imap_user;
  const imapPass = config.imap_password;

  if (!imapHost || !imapUser || !imapPass) {
    console.warn(`[Email Sync] IMAP config incomplete for channel "${channel.name}"`);
    return 0;
  }

  const client = new ImapFlow({
    host: imapHost,
    port: Number(imapPort),
    secure: true,
    auth: { user: imapUser, pass: imapPass },
    logger: false,
  });

  let imported = 0;

  try {
    await client.connect();
    console.log(`[Email Sync] Connected to ${imapUser} (channel: ${channel.name})`);
    const lock = await client.getMailboxLock("INBOX");

    try {
      const mailboxStatus = client.mailbox;
      if (!mailboxStatus || mailboxStatus.exists === 0) {
        console.warn(`[Email Sync] Mailbox empty for ${imapUser}`);
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

        const existing = await prisma.message.findFirst({
          where: { externalId: messageId },
        });
        if (existing) continue;

        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);

        const senderEmail = parsed.from?.value?.[0]?.address;
        const senderName = parsed.from?.value?.[0]?.name || senderEmail || "Unknown";
        const subject = parsed.subject || "";
        const body = parsed.text || parsed.html || "";

        if (!senderEmail) continue;

        const leadData = parseEmail(body, subject);
        const actualEmail = leadData.customerEmail || senderEmail;
        const actualName = leadData.customerName || senderName;

        let contactChannel = await prisma.contactChannel.findFirst({
          where: {
            channelType: "EMAIL",
            identifier: actualEmail,
            companyId: channel!.companyId,
          },
        });

        if (!contactChannel) {
          await prisma.contact.create({
            data: {
              displayName: actualName,
              firstName: actualName.split(" ")[0] || null,
              lastName: actualName.split(" ").slice(1).join(" ") || null,
              companyId: channel!.companyId,
              channels: {
                create: {
                  channelType: "EMAIL",
                  identifier: actualEmail,
                  displayName: actualName,
                  companyId: channel!.companyId,
                },
              },
              ...(leadData.category === "lead" ? {
                customFields: {
                  create: [
                    ...(leadData.productName ? [{ fieldName: "productName", fieldValue: leadData.productName }] : []),
                    ...(leadData.productUrl ? [{ fieldName: "productUrl", fieldValue: leadData.productUrl }] : []),
                    ...(leadData.customerPhone ? [{ fieldName: "phone", fieldValue: leadData.customerPhone }] : []),
                    ...(leadData.customerLang ? [{ fieldName: "lang", fieldValue: leadData.customerLang }] : []),
                  ],
                },
              } : {}),
            },
          });
          contactChannel = await prisma.contactChannel.findFirst({
            where: {
              channelType: "EMAIL",
              identifier: actualEmail,
              companyId: channel!.companyId,
            },
          });
          if (!contactChannel) continue;
        }

        const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactChannel.contactId } });

        const threadId = parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references[0]
            : parsed.references
          : null;

        let conversation = threadId
          ? await prisma.conversation.findFirst({
              where: {
                contactId: contact.id,
                channelId: channel.id,
                externalId: threadId,
              },
            })
          : null;

        if (!conversation) {
          conversation = await prisma.conversation.findFirst({
            where: {
              contactId: contact.id,
              channelId: channel.id,
              status: { notIn: ["CLOSED", "SPAM"] },
            },
            orderBy: { createdAt: "desc" },
          });
        }

        const isNew = !conversation;

        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              contactId: contact.id,
              channelId: channel!.id,
              subject,
              status: "NEW",
              priority: "NORMAL",
              externalId: threadId || messageId,
              companyId: channel!.companyId,
            },
          });
          await prisma.conversationEvent.create({
            data: {
              conversationId: conversation.id,
              type: "CONVERSATION_CREATED",
              actorUserId: null,
              payload: { source: "email" },
              companyId: channel!.companyId,
            },
          });
        }

        const hasAttachments = parsed.attachments && parsed.attachments.length > 0;

        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            channelId: channel!.id,
            direction: "INBOUND",
            contentType: hasAttachments ? "FILE" : "TEXT",
            body: body.slice(0, 10000),
            externalId: messageId,
            contactId: contact.id,
            companyId: channel!.companyId,
          },
        });

        // Save attachments from email
        if (parsed.attachments && parsed.attachments.length > 0) {
          const attachments = parsed.attachments.slice(0, MAX_ATTACHMENTS_PER_EMAIL);
          const attachDir = path.join(UPLOADS_DIR, channel.id, message.id);
          fs.mkdirSync(attachDir, { recursive: true });

          for (const att of attachments) {
            if (!att.content || att.size > MAX_ATTACHMENT_SIZE) continue;
            const fileName = att.filename || `attachment-${Date.now()}`;
            const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const filePath = path.join(attachDir, safeName);

            try {
              fs.writeFileSync(filePath, att.content);
              const storageKey = `uploads/${channel.id}/${message.id}/${safeName}`;
              const storageUrl = `/${storageKey}`;

              await prisma.messageAttachment.create({
                data: {
                  messageId: message.id,
                  fileName: att.filename || safeName,
                  mimeType: att.contentType || "application/octet-stream",
                  fileSize: att.size || att.content.length,
                  storageKey,
                  storageUrl,
                },
              });
              console.log(`[Email Sync] Saved attachment: ${fileName} (${att.size} bytes)`);
            } catch (attErr) {
              console.error(`[Email Sync] Failed to save attachment ${fileName}:`, attErr);
            }
          }
        }

        await prisma.messageStatusEvent.create({
          data: { messageId: message.id, status: "DELIVERED" },
        });

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: parsed.date || new Date(),
            status: conversation.status === "WAITING_REPLY" ? "OPEN" : undefined,
          },
        });

        if (isNew) {
          const summary = await buildConversationSummary(conversation.id);
          if (summary) {
            emitMessagingEvent({
              type: "new_conversation",
              conversationId: conversation.id,
              conversation: summary,
            });
          }
        } else {
          emitMessagingEvent({
            type: "new_message",
            conversationId: conversation.id,
            message: {
              id: message.id,
              conversationId: conversation.id,
              direction: "INBOUND",
              contentType: hasAttachments ? "FILE" : "TEXT",
              body: body.slice(0, 10000),
              createdAt: message.createdAt.toISOString(),
              contact: {
                id: contact.id,
                name: contact.displayName,
                avatarUrl: contact.avatarUrl,
              },
              status: "DELIVERED",
            },
            conversationPatch: {
              lastMessageAt: (parsed.date || new Date()).toISOString(),
              lastMessagePreview: (subject || body.slice(0, 100)).slice(0, 120),
            },
          });
        }

        imported++;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Email Sync] Error for ${imapUser}:`, errMsg);
  } finally {
    await client.logout().catch(() => {});
  }

  console.log(`[Email Sync] Imported ${imported} emails from ${imapUser}`);
  return imported;
}
