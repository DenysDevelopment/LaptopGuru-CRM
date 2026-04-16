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
      return NextResponse.json({
        landing: { id: landing.id, slug, url: landingUrl },
        shortLink: { code: shortCode, url: shortUrl },
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
