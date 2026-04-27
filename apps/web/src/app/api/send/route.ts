import { NextRequest, NextResponse } from "next/server";
import * as nodemailer from "nodemailer";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { generateSlug, createShortLink } from "@/lib/links";
import { buildEmailHtml } from "@/lib/email-template";
import { SUBJECT_BY_LANG, TITLE_BY_LANG, FALLBACK_NAME, BUY_BUTTON_BY_LANG } from "@/lib/constants/languages";
import { formatSmtpFrom } from "@/lib/smtp";
import { sendSchema } from "@/lib/schemas/send";
import { validateRequest } from "@/lib/validate-request";
import { sendViaAllegroDirect } from "@/lib/messaging/allegro-send";

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.SEND_EXECUTE);
  if (error) return error;

  const validation = await validateRequest(request, sendSchema);
  if (!validation.ok) return validation.response;

  const data = validation.data;
  const { mode, videoId, language: lang } = data;
  const emailId = data.mode === "email" ? data.emailId : undefined;
  const personalNote = data.mode === "email" ? data.personalNote : undefined;
  const manualProductUrl = data.mode === "allegro" ? data.productUrl : undefined;
  const allegroThreadId = data.mode === "allegro" ? data.allegroThreadId : undefined;
  const allegroBuyerLogin = data.mode === "allegro" ? data.allegroBuyerLogin : undefined;
  const allegroMessage = data.mode === "allegro" ? data.allegroMessage : undefined;

  const incomingEmail =
    mode === "email"
      ? await prisma.incomingEmail.findUnique({ where: { id: emailId! } })
      : null;

  if (mode === "email") {
    if (!incomingEmail || !incomingEmail.customerEmail || incomingEmail.companyId !== (session.user.companyId ?? "")) {
      return NextResponse.json(
        { error: "Заявка не найдена или нет email клиента" },
        { status: 400 }
      );
    }
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
  });
  if (!video || !video.active || video.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json({ error: "Видео не найдено" }, { status: 400 });
  }

  const appUrl =
    process.env.APP_URL && !process.env.APP_URL.includes('localhost')
      ? process.env.APP_URL
      : request.nextUrl.origin;

  // Prefer the company's customDomain for public-facing short links and
  // landing URLs so both email and Allegro flows point customers at the
  // branded domain (e.g. l.laptopguru.pl) rather than the CRM host. The
  // custom-domain middleware rewrites /{slug} → /l/{slug} and /{code} →
  // /r/{code}, so the /l/ and /r/ prefixes are dropped on that domain.
  const company = session.user.companyId
    ? await prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { customDomain: true },
      })
    : null;
  const publicBase = company?.customDomain
    ? `https://${company.customDomain}`
    : appUrl;
  const useCustomDomain = Boolean(company?.customDomain);

  try {
    let slug = generateSlug();
    while (await prisma.landing.findFirst({ where: { slug, companyId: session.user.companyId ?? "" } })) {
      slug = generateSlug();
    }

    const landing = await prisma.landing.create({
      data: {
        slug,
        title: TITLE_BY_LANG[lang](video.title),
        videoId: video.id,
        productUrl: mode === "allegro" ? manualProductUrl! : (incomingEmail?.productUrl || ""),
        buyButtonText: BUY_BUTTON_BY_LANG[lang],
        personalNote: mode === "allegro" ? null : (personalNote || null),
        customerName: mode === "allegro" ? null : (incomingEmail?.customerName || null),
        productName: mode === "allegro" ? null : (incomingEmail?.productName || null),
        language: lang,
        type: mode,
        emailId: mode === "allegro" ? null : incomingEmail?.id,
        allegroThreadId: mode === "allegro" ? (allegroThreadId ?? null) : null,
        allegroBuyerLogin: mode === "allegro" ? (allegroBuyerLogin ?? null) : null,
        userId: session.user.id,
        companyId: session.user.companyId ?? "",
      },
    });

    const shortCode = await createShortLink(landing.id);
    const shortUrl = useCustomDomain
      ? `${publicBase}/${shortCode}`
      : `${publicBase}/r/${shortCode}`;
    const landingUrl = useCustomDomain
      ? `${publicBase}/${slug}`
      : `${publicBase}/l/${slug}`;

    if (mode === "allegro") {
      // Optional: when a threadId is supplied, deliver the link directly into
      // the buyer's Allegro discussion via the Allegro Direct API. Errors
      // here are non-fatal — the landing+shortlink are already saved and
      // the admin can copy-paste manually as a fallback.
      let allegroDelivered: { ok: boolean; error?: string; messageId?: string } | null = null;
      if (allegroThreadId) {
        try {
          allegroDelivered = await sendViaAllegroDirect({
            companyId: session.user.companyId ?? "",
            threadId: allegroThreadId,
            text: (allegroMessage && allegroMessage.trim().length > 0)
              ? `${allegroMessage}\n${shortUrl}`
              : shortUrl,
          });
        } catch (err) {
          allegroDelivered = {
            ok: false,
            error: err instanceof Error ? err.message : "Allegro send failed",
          };
        }
      }
      return NextResponse.json({
        landing: { id: landing.id, slug, url: landingUrl, previewToken: landing.previewToken },
        shortLink: { code: shortCode, url: shortUrl },
        allegro: allegroDelivered,
      }, { status: 201 });
    }

    // Email mode: send email via SMTP
    const html = buildEmailHtml({
      customerName: incomingEmail!.customerName || FALLBACK_NAME[lang],
      videoTitle: video.title,
      thumbnail: video.thumbnail,
      landingUrl: shortUrl,
      personalNote: personalNote || undefined,
      language: lang,
    });

    const subject = SUBJECT_BY_LANG[lang](
      incomingEmail!.customerName || undefined,
      incomingEmail!.productName || undefined,
    );

    const emailChannel = await prisma.channel.findFirst({
      where: { type: "EMAIL", isActive: true, companyId: session.user.companyId ?? "" },
      include: { config: true },
    });

    if (!emailChannel) {
      return NextResponse.json(
        { error: "Не настроен EMAIL-канал. Настройте SMTP в Настройки → Каналы." },
        { status: 400 }
      );
    }

    const cfg = Object.fromEntries(emailChannel.config.map((c) => [c.key, c.value]));
    const smtpHost = cfg.smtp_host;
    const smtpPort = cfg.smtp_port || "465";
    const smtpUser = cfg.smtp_user;
    const smtpPass = cfg.smtp_password;
    const smtpFrom = cfg.smtp_from || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { error: "SMTP не полностью настроен. Проверьте Настройки → Каналы." },
        { status: 400 }
      );
    }

    let status = "sent";
    let errorMessage: string | null = null;

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: Number(smtpPort) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: formatSmtpFrom(cfg.smtp_display_name, smtpFrom),
        to: incomingEmail!.customerEmail!,
        subject,
        html,
      });
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : "Send failed";
    }

    const sentEmail = await prisma.sentEmail.create({
      data: {
        to: incomingEmail!.customerEmail!,
        subject,
        landingId: landing.id,
        userId: session.user.id,
        status,
        errorMessage,
        companyId: session.user.companyId ?? "",
      },
    });

    await prisma.incomingEmail.update({
      where: { id: emailId! },
      data: { processed: true, processedById: session.user.id },
    });

    // Mirror the send into the unified messaging inbox: write an OUTBOUND
    // Message + LANDING_SENT event onto the IncomingEmail's Conversation
    // (created by the IMAP mirror), and bump the status to WAITING_REPLY.
    if (status === "sent") {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { incomingEmailId: emailId! },
          select: { id: true, channelId: true, contactId: true, companyId: true },
        });
        if (conversation) {
          const message = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              channelId: conversation.channelId,
              direction: "OUTBOUND",
              contentType: "TEXT",
              body: `Видео-рецензия отправлена: ${video.title}\n${shortUrl}`,
              metadata: { eventType: "LANDING_SENT", landingId: landing.id },
              senderId: session.user.id,
              contactId: conversation.contactId,
              companyId: conversation.companyId,
            },
          });
          await prisma.conversationEvent.create({
            data: {
              conversationId: conversation.id,
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
              },
              companyId: conversation.companyId,
            },
          });
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: new Date() },
          });
          // Audit-aware status transition (NEW/OPEN/RESOLVED → WAITING_REPLY)
          const { transitionConversationStatus } = await import(
            "@/lib/messaging/transition-status"
          );
          await transitionConversationStatus({
            conversationId: conversation.id,
            toStatus: "WAITING_REPLY",
            actorUserId: session.user.id,
            reason: "send-from-email-mode",
            requireFromStatus: ["NEW", "OPEN", "RESOLVED"],
          }).catch(() => {/* non-fatal */});
        }
      } catch (err) {
        console.warn("[Send] Failed to mirror into conversation:", err);
      }
    }

    return NextResponse.json({
      landing: { id: landing.id, slug, url: landingUrl, previewToken: landing.previewToken },
      shortLink: { code: shortCode, url: shortUrl },
      sentEmail: { id: sentEmail.id, status },
    }, { status: 201 });
  } catch (error) {
    console.error("[Send] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Ошибка отправки" }, { status: 500 });
  }
}
