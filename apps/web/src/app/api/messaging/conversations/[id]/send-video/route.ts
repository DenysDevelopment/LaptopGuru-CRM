import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { generateSlug, createShortLink } from "@/lib/links";
import { sendEmail } from "@/lib/smtp";
import { buildEmailHtml } from "@/lib/email-template";
import type { EmailLanguage } from "@/lib/email-template";
import { emitMessagingEvent } from "@/lib/messaging-events";
import { VALID_LANGUAGES, SUBJECT_BY_LANG, TITLE_BY_LANG, FALLBACK_NAME } from "@/lib/constants/languages";

/**
 * POST /api/messaging/conversations/:id/send-video
 * Send a video review email to the contact in this conversation.
 * Body: { videoId, personalNote?, buyButtonText?, language? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.SEND_EXECUTE);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { videoId, personalNote, language } = body;
  const lang: EmailLanguage = VALID_LANGUAGES.includes(language) ? language : "pl";

  if (!videoId) {
    return NextResponse.json({ error: "videoId обязателен" }, { status: 400 });
  }

  // Get conversation with contact
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: {
        include: {
          channels: { where: { channelType: "EMAIL" } },
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

  const emailChannel = conversation.contact.channels[0];
  if (!emailChannel) {
    return NextResponse.json({ error: "У контакта нет email" }, { status: 400 });
  }

  const customerEmail = emailChannel.identifier;
  const customerName = conversation.contact.displayName;
  const productUrl = conversation.contact.customFields.find((f) => f.fieldName === "productUrl")?.fieldValue || "";
  const productName = conversation.contact.customFields.find((f) => f.fieldName === "productName")?.fieldValue || null;

  // Get video
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || !video.active || video.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Видео не найдено" }, { status: 400 });
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    // 1. Create landing
    let slug = generateSlug();
    while (await prisma.landing.findFirst({ where: { slug, companyId: session.user.companyId ?? "" } })) {
      slug = generateSlug();
    }

    const landing = await prisma.landing.create({
      data: {
        slug,
        title: TITLE_BY_LANG[lang](video.title),
        videoId: video.id,
        productUrl,
        buyButtonText: ({ pl: "Sprawdź ofertę", uk: "Переглянути пропозицію", ru: "Смотреть предложение", en: "View offer" })[lang] || "Sprawdź ofertę",
        personalNote: personalNote || null,
        customerName,
        productName,
        language: lang,
        userId: session.user.id,
        companyId: session.user.companyId ?? "",
      },
    });

    // 2. Create short link
    const shortCode = await createShortLink(landing.id);
    const shortUrl = `${appUrl}/r/${shortCode}`;

    // 3. Build and send email
    const html = buildEmailHtml({
      customerName: customerName || FALLBACK_NAME[lang],
      videoTitle: video.title,
      thumbnail: video.thumbnail,
      landingUrl: shortUrl,
      personalNote: personalNote || undefined,
      language: lang,
    });

    const emailSubject = SUBJECT_BY_LANG[lang](video.title);

    await sendEmail({
      to: customerEmail,
      subject: emailSubject,
      html,
    });

    // 4. Record sent email
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

    // 5. Add outbound message to conversation
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        channelId: conversation.channelId,
        direction: "OUTBOUND",
        contentType: "TEXT",
        body: `Видео-рецензия отправлена: ${video.title}\n${shortUrl}`,
        senderId: session.user.id,
        contactId: conversation.contactId,
        companyId: session.user.companyId ?? "",
      },
    });

    await prisma.messageStatusEvent.create({
      data: { messageId: message.id, status: "SENT" },
    });

    // 6. Update conversation
    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date(), status: "WAITING_REPLY" },
    });

    // 7. Emit SSE
    emitMessagingEvent({
      type: "new_message",
      conversationId: id,
      data: { messageId: message.id, direction: "OUTBOUND" },
    });

    return NextResponse.json({
      ok: true,
      landingUrl: `${appUrl}/l/${slug}`,
      shortUrl,
      videoTitle: video.title,
    });
  } catch (err) {
    console.error("[Send Video] Error:", err);
    return NextResponse.json(
      { error: "Ошибка отправки видео" },
      { status: 500 },
    );
  }
}
