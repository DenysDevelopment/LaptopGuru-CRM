import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { generateSlug, createShortLink } from "@/lib/links";
import { sendEmail } from "@/lib/smtp";
import { buildEmailHtml } from "@/lib/email-template";
import type { EmailLanguage } from "@/lib/email-template";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { transitionConversationStatus } from "@/lib/messaging/transition-status";
import { sendViaAllegroDirect } from "@/lib/messaging/allegro-send";
import {
  VALID_LANGUAGES,
  SUBJECT_BY_LANG,
  TITLE_BY_LANG,
  FALLBACK_NAME,
  BUY_BUTTON_BY_LANG,
  CHAT_TEMPLATE_BY_LANG,
  applyChatTemplate,
  joinChatBody,
} from "@/lib/constants/languages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.SEND_EXECUTE);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { videoId, personalNote, language, messageBody } = body;
  const lang: EmailLanguage = VALID_LANGUAGES.includes(language) ? language : "pl";

  if (!videoId) {
    return NextResponse.json({ error: "videoId обязателен" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: {
        include: {
          channels: true,
          customFields: true,
        },
      },
      channel: true,
    },
  });

  if (!conversation || conversation.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Разговор не найден" }, { status: 404 });
  }
  if (!conversation.contact) {
    return NextResponse.json({ error: "Разговор не найден" }, { status: 404 });
  }

  const channelType = conversation.channel?.type;
  if (!channelType) {
    return NextResponse.json({ error: "Канал не найден" }, { status: 400 });
  }
  const customerName = conversation.contact.displayName;
  const productUrl =
    conversation.contact.customFields.find((f) => f.fieldName === "productUrl")?.fieldValue || "";
  const productName =
    conversation.contact.customFields.find((f) => f.fieldName === "productName")?.fieldValue ||
    null;

  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || !video.active || video.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Видео не найдено" }, { status: 400 });
  }

  // Idempotency guard: refuse a second landing-send to the same conversation
  // within DEBOUNCE_SEC. Without this, a frustrated agent who didn't see the
  // message land instantly clicks "Send" again, the API duplicates the
  // landing + chat messages, and Allegro starts rate-limiting the channel.
  const DEBOUNCE_SEC = 30;
  const recentSend = await prisma.message.findFirst({
    where: {
      conversationId: id,
      direction: "OUTBOUND",
      createdAt: { gte: new Date(Date.now() - DEBOUNCE_SEC * 1000) },
      // metadata.eventType = "LANDING_SENT" → the message marker we set below.
      AND: [{ metadata: { path: ["eventType"], equals: "LANDING_SENT" } }],
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (recentSend) {
    const ageSec = Math.round(
      (Date.now() - recentSend.createdAt.getTime()) / 1000,
    );
    return NextResponse.json(
      {
        error: `Лендинг уже отправлен ${ageSec} с назад. Подождите ${DEBOUNCE_SEC - ageSec} с перед повтором.`,
      },
      { status: 429 },
    );
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    let slug = generateSlug();
    while (
      await prisma.landing.findFirst({
        where: { slug, companyId: session.user.companyId ?? "" },
      })
    ) {
      slug = generateSlug();
    }

    const landing = await prisma.landing.create({
      data: {
        slug,
        title: TITLE_BY_LANG[lang](video.title),
        videoId: video.id,
        productUrl,
        buyButtonText: BUY_BUTTON_BY_LANG[lang],
        personalNote: personalNote || null,
        customerName,
        productName,
        language: lang,
        // For ALLEGRO threads, remember the thread id so the landing knows
        // which Allegro conversation it belongs to (used by analytics/sidebar).
        type: channelType === "ALLEGRO" ? "allegro" : "email",
        allegroThreadId: channelType === "ALLEGRO" ? conversation.externalId : null,
        allegroBuyerLogin:
          channelType === "ALLEGRO"
            ? conversation.contact.channels.find((c) => c.channelType === "ALLEGRO")?.identifier ??
              null
            : null,
        userId: session.user.id,
        companyId: session.user.companyId ?? "",
      },
    });

    const shortCode = await createShortLink(landing.id);
    const shortUrl = `${appUrl}/r/${shortCode}`;

    // Build the chat-side message that goes into the conversation timeline
    // (and into Allegro/Telegram chat). Falls back to a per-language default
    // template when the agent didn't customize it. Split into text + URL so
    // chat adapters can deliver them as two separate messages — that way the
    // customer can long-press the URL to copy without grabbing the text.
    const userTemplate = (messageBody || "").trim();
    const template = userTemplate || CHAT_TEMPLATE_BY_LANG[lang];
    const chatParts = applyChatTemplate(template, {
      url: shortUrl,
      name: customerName,
      productName,
    });
    // Single string used for the archived Message body and EMAIL plain text.
    const chatBody = joinChatBody(chatParts);

    // ── Outbound delivery ────────────────────────────────────────────────
    let deliveryStatus: "SENT" | "FAILED" = "FAILED";
    let externalId: string | undefined;
    let deliveryError: string | undefined;

    if (channelType === "EMAIL") {
      const emailChannel = conversation.contact.channels.find(
        (c) => c.channelType === "EMAIL",
      );
      if (!emailChannel) {
        return NextResponse.json({ error: "У контакта нет email" }, { status: 400 });
      }
      const customerEmail = emailChannel.identifier;
      const html = buildEmailHtml({
        customerName: customerName || FALLBACK_NAME[lang],
        videoTitle: video.title,
        thumbnail: video.thumbnail,
        landingUrl: shortUrl,
        personalNote: personalNote || undefined,
        language: lang,
      });
      const emailSubject = SUBJECT_BY_LANG[lang](
        customerName || undefined,
        productName || undefined,
      );
      try {
        await sendEmail({ to: customerEmail, subject: emailSubject, html });
        await prisma.sentEmail.create({
          data: {
            to: customerEmail,
            subject: emailSubject,
            landingId: landing.id,
            userId: session.user.id,
            status: "sent",
            companyId: session.user.companyId ?? "",
          },
        });
        deliveryStatus = "SENT";
      } catch (err) {
        deliveryError = err instanceof Error ? err.message : "SMTP error";
        console.error("[send-landing/EMAIL] error:", err);
      }
    } else if (channelType === "ALLEGRO") {
      if (!conversation.externalId) {
        return NextResponse.json(
          { error: "Allegro thread id missing on conversation" },
          { status: 400 },
        );
      }
      // Two separate Allegro messages: lead-in text first, then the bare URL
      // so the buyer can long-press to copy without dragging the text.
      // The text message is optional (only when the template has any prose).
      if (chatParts.text) {
        const textRes = await sendViaAllegroDirect({
          companyId: conversation.companyId,
          threadId: conversation.externalId,
          text: chatParts.text,
        });
        if (!textRes.ok) {
          deliveryError = textRes.error;
          console.error("[send-landing/ALLEGRO] text-part error:", textRes.error);
        }
      }
      const urlRes = await sendViaAllegroDirect({
        companyId: conversation.companyId,
        threadId: conversation.externalId,
        text: chatParts.url,
      });
      if (urlRes.ok) {
        deliveryStatus = "SENT";
        // The URL message id is the canonical externalId for the LANDING_SENT
        // marker — buyers will reply to that message in most cases.
        externalId = urlRes.messageId;
      } else {
        deliveryError = urlRes.error;
        console.error("[send-landing/ALLEGRO] url-part error:", urlRes.error);
      }
    } else {
      return NextResponse.json(
        { error: `Канал ${channelType} пока не поддерживается для отправки лендинга` },
        { status: 400 },
      );
    }

    if (deliveryStatus === "FAILED") {
      return NextResponse.json(
        { error: deliveryError || "Ошибка доставки" },
        { status: 502 },
      );
    }

    // ── Persist as a Message in the conversation timeline ────────────────
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        channelId: conversation.channelId,
        direction: "OUTBOUND",
        contentType: "TEXT",
        body: chatBody,
        externalId,
        // Marks this Message as the raw text behind a LANDING_SENT event so
        // the timeline UI can hide it in favour of the rich event card.
        metadata: {
          eventType: "LANDING_SENT",
          landingId: landing.id,
        },
        senderId: session.user.id,
        contactId: conversation.contactId,
        companyId: session.user.companyId ?? "",
      },
    });

    await prisma.messageStatusEvent.create({
      data: { messageId: message.id, status: "SENT" },
    });

    await prisma.conversationEvent.create({
      data: {
        conversationId: id,
        type: "LANDING_SENT",
        actorUserId: session.user.id,
        payload: {
          landingId: landing.id,
          slug,
          videoId: video.id,
          videoTitle: video.title,
          videoThumbnail: video.thumbnail,
          shortUrl,
          messageId: message.id,
          previewToken: landing.previewToken,
        },
        companyId: session.user.companyId ?? "",
      },
    });

    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });
    await transitionConversationStatus({
      conversationId: id,
      toStatus: "WAITING_REPLY",
      actorUserId: session.user.id,
      reason: "landing-sent",
      requireFromStatus: ["NEW", "OPEN", "RESOLVED"],
    }).catch(() => {
      /* non-fatal */
    });

    emitMessagingEvent({
      type: "new_message",
      conversationId: id,
      message: {
        id: message.id,
        conversationId: id,
        direction: "OUTBOUND",
        contentType: message.contentType,
        body: message.body ?? "",
        createdAt: message.createdAt.toISOString(),
        sender: { id: session.user.id, name: session.user.name ?? null },
        metadata: {
          eventType: "LANDING_SENT",
          landingId: landing.id,
        },
        status: "SENT",
      },
      conversationPatch: {
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: (message.body ?? "").slice(0, 120),
      },
    });

    return NextResponse.json({
      ok: true,
      landingUrl: `${appUrl}/l/${slug}`,
      shortUrl,
      videoTitle: video.title,
    });
  } catch (err) {
    console.error("[send-landing] Error:", err);
    return NextResponse.json(
      { error: "Ошибка отправки лендинга" },
      { status: 500 },
    );
  }
}
