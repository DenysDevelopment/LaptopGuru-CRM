import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { generateSlug, generateShortCode } from '../../common/utils/links';
import { buildEmailHtml } from '../../common/utils/email-template';
import type { EmailLanguage } from '../../common/utils/email-template';
import {
  VALID_LANGUAGES,
  SUBJECT_BY_LANG,
  TITLE_BY_LANG,
  FALLBACK_NAME,
  BUY_BUTTON_BY_LANG,
} from '../../common/utils/languages';

interface SendDto {
  emailId: string;
  videoId: string;
  personalNote?: string;
  buyButtonText?: string;
  language?: string;
}

@Injectable()
export class SendService {
  private readonly logger = new Logger(SendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async sendVideoEmail(dto: SendDto, userId: string) {
    const { emailId, videoId, personalNote, buyButtonText, language } = dto;
    const lang: EmailLanguage = VALID_LANGUAGES.includes(language as EmailLanguage)
      ? (language as EmailLanguage)
      : 'pl';

    if (!emailId || !videoId) {
      throw new BadRequestException('emailId and videoId are required');
    }

    const incomingEmail = await this.prisma.incomingEmail.findUnique({
      where: { id: emailId },
    });
    if (!incomingEmail || !incomingEmail.customerEmail) {
      throw new BadRequestException('Email not found or missing customer email');
    }

    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });
    if (!video || !video.active) {
      throw new BadRequestException('Video not found');
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    try {
      // 1. Create landing page
      const companyId = this.cls.get<string>('companyId');

      // Prefer the company's customDomain for public links so customers land on
      // the external site (e.g. www.laptop.guru) instead of the CRM host.
      // Middleware on the custom domain rewrites /{slug} → /l/{slug} and
      // /{6-char code} → /r/{code}, so we can drop the /l/ and /r/ prefixes.
      const company = companyId
        ? await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { customDomain: true },
          })
        : null;
      const publicBase = company?.customDomain
        ? `https://${company.customDomain}`
        : appUrl;
      const useCustomDomain = Boolean(company?.customDomain);

      let slug = generateSlug();
      while (await this.prisma.landing.findFirst({ where: { slug, companyId } })) {
        slug = generateSlug();
      }

      const landing = await this.prisma.landing.create({
        data: {
          slug,
          title: TITLE_BY_LANG[lang](video.title),
          videoId: video.id,
          productUrl: incomingEmail.productUrl || '',
          buyButtonText: buyButtonText || BUY_BUTTON_BY_LANG[lang],
          personalNote: personalNote || null,
          customerName: incomingEmail.customerName || null,
          productName: incomingEmail.productName || null,
          language: lang,
          emailId: incomingEmail.id,
          userId,
          companyId,
        },
      });

      // 2. Create short link
      let shortCode = generateShortCode();
      while (await this.prisma.shortLink.findUnique({ where: { code: shortCode } })) {
        shortCode = generateShortCode();
      }
      await this.prisma.shortLink.create({
        data: { code: shortCode, landingId: landing.id, companyId },
      });

      const shortUrl = useCustomDomain
        ? `${publicBase}/${shortCode}`
        : `${publicBase}/r/${shortCode}`;
      const landingUrl = useCustomDomain
        ? `${publicBase}/${slug}`
        : `${publicBase}/l/${slug}`;

      // 3. Build and send email
      const html = buildEmailHtml({
        customerName: incomingEmail.customerName || FALLBACK_NAME[lang],
        videoTitle: video.title,
        thumbnail: video.thumbnail,
        landingUrl: shortUrl,
        personalNote: personalNote || undefined,
        language: lang,
      });

      const subject = SUBJECT_BY_LANG[lang](
        incomingEmail.customerName || undefined,
        incomingEmail.productName || undefined,
      );

      // Get company's EMAIL channel SMTP config
      const emailChannel = await this.prisma.channel.findFirst({
        where: { type: 'EMAIL', isActive: true, companyId },
        include: { config: true },
      });

      if (!emailChannel) {
        throw new BadRequestException('No active EMAIL channel configured for this company. Set up SMTP in Settings → Channels.');
      }

      const cfg = Object.fromEntries(emailChannel.config.map((c) => [c.key, c.value]));
      const smtpHost = cfg.smtp_host;
      const smtpPort = cfg.smtp_port || '465';
      const smtpUser = cfg.smtp_user;
      const smtpPass = cfg.smtp_password;
      const smtpFrom = cfg.smtp_from || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPass) {
        throw new BadRequestException('SMTP not fully configured for this company. Check Settings → Channels.');
      }

      let status = 'sent';
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
        status = 'failed';
        errorMessage = err instanceof Error ? err.message : 'Send failed';
      }

      // 4. Record sent email
      const sentEmail = await this.prisma.sentEmail.create({
        data: {
          to: incomingEmail.customerEmail,
          subject,
          landingId: landing.id,
          userId,
          status,
          errorMessage,
          companyId,
        },
      });

      // 5. Mark incoming email as processed
      await this.prisma.incomingEmail.update({
        where: { id: emailId },
        data: { processed: true, processedById: userId },
      });

      return {
        landing: { id: landing.id, slug, url: landingUrl },
        shortLink: { code: shortCode, url: shortUrl },
        sentEmail: { id: sentEmail.id, status },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        '[Send] Error:',
        error instanceof Error ? error.message : error,
      );
      throw new InternalServerErrorException('Send error');
    }
  }
}
