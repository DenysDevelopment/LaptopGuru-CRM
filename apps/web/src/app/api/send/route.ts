import { NextRequest, NextResponse } from "next/server";
import * as nodemailer from "nodemailer";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";
import { generateSlug, createShortLink } from "@/lib/links";
import { buildEmailHtml } from "@/lib/email-template";
import type { EmailLanguage } from "@/lib/email-template";
import { VALID_LANGUAGES, SUBJECT_BY_LANG, TITLE_BY_LANG, FALLBACK_NAME } from "@/lib/constants/languages";

export async function POST(request: NextRequest) {
  const { session, error } = await authorize(PERMISSIONS.SEND_EXECUTE);
  if (error) return error;

  const body = await request.json();
  const { emailId, videoId, personalNote, language } = body;
  const lang: EmailLanguage = VALID_LANGUAGES.includes(language) ? language : "pl";

  if (!emailId || !videoId) {
    return NextResponse.json(
      { error: "emailId и videoId обязательны" },
      { status: 400 }
    );
  }

  // Fetch the incoming email
  const incomingEmail = await prisma.incomingEmail.findUnique({
    where: { id: emailId },
  });
  if (!incomingEmail || !incomingEmail.customerEmail || incomingEmail.companyId !== (session.user.companyId ?? "")) {
    return NextResponse.json(
      { error: "Заявка не найдена или нет email клиента" },
      { status: 400 }
    );
  }

  // Fetch video
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

  try {
    // 1. Create landing page
    let slug = generateSlug();
    while (await prisma.landing.findFirst({ where: { slug, companyId: session.user.companyId ?? "" } })) {
      slug = generateSlug();
    }

    const landing = await prisma.landing.create({
      data: {
        slug,
        title: TITLE_BY_LANG[lang](video.title),
        videoId: video.id,
        productUrl: incomingEmail.productUrl || "",
        buyButtonText: ({ pl: "Sprawdź ofertę", uk: "Переглянути пропозицію", ru: "Смотреть предложение", en: "View offer" })[lang] || "Sprawdź ofertę",
        personalNote: personalNote || null,
        customerName: incomingEmail.customerName || null,
        productName: incomingEmail.productName || null,
        language: lang,
        emailId: incomingEmail.id,
        userId: session.user.id,
        companyId: session.user.companyId ?? "",
      },
    });

    // 2. Create short link
    const shortCode = await createShortLink(landing.id);
    const shortUrl = `${appUrl}/r/${shortCode}`;
    const landingUrl = `${appUrl}/l/${slug}`;

    // 3. Build and send email
    const html = buildEmailHtml({
      customerName: incomingEmail.customerName || FALLBACK_NAME[lang],
      videoTitle: video.title,
      thumbnail: video.thumbnail,
      landingUrl: shortUrl,
      personalNote: personalNote || undefined,
      language: lang,
    });

    const subject = SUBJECT_BY_LANG[lang](video.title);

    // Get company's EMAIL channel SMTP config
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
        from: `"${emailChannel.name}" <${smtpFrom}>`,
        to: incomingEmail.customerEmail,
        subject,
        html,
      });
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : "Send failed";
    }

    // 4. Record sent email
    const sentEmail = await prisma.sentEmail.create({
      data: {
        to: incomingEmail.customerEmail,
        subject,
        landingId: landing.id,
        userId: session.user.id,
        status,
        errorMessage,
        companyId: session.user.companyId ?? "",
      },
    });

    // 5. Mark incoming email as processed
    await prisma.incomingEmail.update({
      where: { id: emailId },
      data: { processed: true, processedById: session.user.id },
    });

    return NextResponse.json({
      landing: { id: landing.id, slug, url: landingUrl },
      shortLink: { code: shortCode, url: shortUrl },
      sentEmail: { id: sentEmail.id, status },
    }, { status: 201 });
  } catch (error) {
    console.error("[Send] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Ошибка отправки" }, { status: 500 });
  }
}
