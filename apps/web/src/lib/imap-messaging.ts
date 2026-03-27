import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { parseEmail } from "@/lib/parser";

/**
 * Sync emails from IMAP into the messaging system (Contact → Conversation → Message).
 * Uses ChannelConfig from the EMAIL channel in DB.
 */
export async function syncEmailsToMessaging(): Promise<number> {
  // Find active EMAIL channel
  const channel = await prisma.channel.findFirst({
    where: { type: "EMAIL", isActive: true },
    include: { config: true },
  });

  if (!channel) {
    console.warn("[Email Sync] No active EMAIL channel found");
    return 0;
  }

  const config = Object.fromEntries(channel.config.map((c) => [c.key, c.value]));

  const imapHost = config.imap_host || config.imapHost;
  const imapPort = config.imap_port || config.imapPort || "993";
  const imapUser = config.imap_user || config.username || config.imapUser;
  const imapPass = config.imap_password || config.password || config.imapPassword;

  if (!imapHost || !imapUser || !imapPass) {
    console.warn("[Email Sync] IMAP config incomplete");
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
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Check if mailbox has messages before fetching
      const mailboxStatus = client.mailbox;
      if (!mailboxStatus || mailboxStatus.exists === 0) {
        console.warn("[Email Sync] Mailbox is empty");
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

        // Skip if message already exists in messaging system
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

        // Parse Shopify/lead data from email body
        const leadData = parseEmail(body, subject);
        // Use parsed customer email/name if available (from form fields)
        const actualEmail = leadData.customerEmail || senderEmail;
        const actualName = leadData.customerName || senderName;

        // Find or create contact (use customer email from form if available)
        let contactChannel = await prisma.contactChannel.findUnique({
          where: {
            channelType_identifier: {
              channelType: "EMAIL",
              identifier: actualEmail,
            },
          },
          include: { contact: true },
        });

        if (!contactChannel) {
          await prisma.contact.create({
            data: {
              displayName: actualName,
              firstName: actualName.split(" ")[0] || null,
              lastName: actualName.split(" ").slice(1).join(" ") || null,
              channels: {
                create: {
                  channelType: "EMAIL",
                  identifier: actualEmail,
                  displayName: actualName,
                },
              },
              // Store parsed lead data as custom fields
              ...(leadData.category === "lead" ? {
                customFields: {
                  create: [
                    ...(leadData.productName ? [{ fieldName: "productName", fieldValue: leadData.productName }] : []),
                    ...(leadData.productUrl ? [{ fieldName: "productUrl", fieldValue: leadData.productUrl }] : []),
                    ...(leadData.customerPhone ? [{ fieldName: "phone", fieldValue: leadData.customerPhone }] : []),
                  ],
                },
              } : {}),
            },
          });
          contactChannel = await prisma.contactChannel.findUnique({
            where: {
              channelType_identifier: {
                channelType: "EMAIL",
                identifier: actualEmail,
              },
            },
            include: { contact: true },
          });
          if (!contactChannel) continue;
        }

        const contact = contactChannel.contact;

        // Find or create conversation (group by email thread or subject)
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
          // Try to find open conversation with same contact
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
              channelId: channel.id,
              subject,
              status: "NEW",
              priority: "NORMAL",
              externalId: threadId || messageId,
            },
          });
        }

        // Create message
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            channelId: channel.id,
            direction: "INBOUND",
            contentType: "TEXT",
            body: body.slice(0, 10000), // limit body size
            externalId: messageId,
            contactId: contact.id,
          },
        });

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

        // Emit SSE event
        emitMessagingEvent({
          type: isNew ? "new_conversation" : "new_message",
          conversationId: conversation.id,
          data: {
            messageId: message.id,
            body: subject || body.slice(0, 100),
            senderName,
            channelType: "EMAIL",
          },
        });

        imported++;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Email Sync] Error:", message);
    // Wrap raw errors to avoid leaking internal details
    throw new Error(`Email sync failed: ${message}`);
  } finally {
    await client.logout().catch(() => {});
  }

  return imported;
}
