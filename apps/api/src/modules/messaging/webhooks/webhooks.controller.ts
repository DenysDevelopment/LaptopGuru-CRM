import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  Query,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ChannelType } from '../../../generated/prisma/client';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

@ApiTags('Webhooks')
@Controller('messaging/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Telegram ─────────────────────────────────────────

  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async handleTelegram(@Req() req: Request) {
    const rawPayload = JSON.stringify(req.body);

    // Validate webhook secret: check channel config, only reject if secret is
    // configured but the header doesn't match (allow through if no secret configured)
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
    const isValid = await this.validateTelegramSecret(secretHeader);
    if (!isValid) {
      this.logger.warn('Invalid Telegram webhook secret');
      return { ok: true }; // Return 200 to avoid Telegram retries
    }

    const update = req.body as Record<string, unknown>;
    const message = (update['message'] ?? update['edited_message'] ?? update['channel_post']) as
      | Record<string, unknown>
      | undefined;

    if (!message) {
      return { ok: true }; // Ignore non-message updates
    }

    const externalId = String((message as Record<string, unknown>)['message_id']);

    await this.webhooksService.processWebhook(
      ChannelType.TELEGRAM,
      rawPayload,
      externalId ? `tg-${externalId}` : undefined,
    );

    return { ok: true };
  }

  // ─── WhatsApp ─────────────────────────────────────────

  @Get('whatsapp')
  handleWhatsAppVerification(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode === 'subscribe') {
      // Validate verify token against stored channel configs
      this.validateWhatsAppVerifyToken(verifyToken).then((valid) => {
        if (valid) {
          this.logger.log('WhatsApp webhook verification successful');
          res.status(200).send(challenge);
        } else {
          this.logger.warn('WhatsApp webhook verification failed');
          res.status(403).send('Forbidden');
        }
      });
    } else {
      res.status(403).send('Forbidden');
    }
  }

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async handleWhatsApp(@Req() req: Request) {
    const rawPayload = JSON.stringify(req.body);
    const payload = req.body as Record<string, unknown>;

    // Extract message ID if present
    const entry = (payload['entry'] as Array<Record<string, unknown>>)?.[0];
    const changes = (entry?.['changes'] as Array<Record<string, unknown>>)?.[0];
    const value = changes?.['value'] as Record<string, unknown> | undefined;
    const messages = value?.['messages'] as Array<Record<string, unknown>> | undefined;
    const externalId = messages?.[0]?.['id'] as string | undefined;

    // Ignore status updates (they don't have messages array)
    if (!messages || messages.length === 0) {
      this.logger.debug('WhatsApp webhook: status update, skipping');
      return { ok: true };
    }

    await this.webhooksService.processWebhook(
      ChannelType.WHATSAPP,
      rawPayload,
      externalId ? `wa-${externalId}` : undefined,
    );

    return { ok: true };
  }

  // ─── SMS (Twilio) ─────────────────────────────────────

  @Post('sms')
  @HttpCode(HttpStatus.OK)
  async handleSms(@Req() req: Request) {
    // Twilio sends x-www-form-urlencoded
    const body = req.body as Record<string, string>;
    const rawPayload = new URLSearchParams(body).toString();

    const messageSid = body['MessageSid'];
    if (!messageSid) {
      throw new BadRequestException('Missing MessageSid');
    }

    // Validate Twilio signature if auth token available
    const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
    if (twilioSignature) {
      const isValid = await this.validateTwilioSignature(
        req,
        twilioSignature,
      );
      if (!isValid) {
        this.logger.warn('Invalid Twilio signature');
        throw new BadRequestException('Invalid signature');
      }
    }

    await this.webhooksService.processWebhook(
      ChannelType.SMS,
      rawPayload,
      `twilio-${messageSid}`,
    );

    // Twilio expects TwiML response
    return '<Response></Response>';
  }

  // ─── Validation Helpers ───────────────────────────────

  private async validateTelegramSecret(
    secretHeader: string | undefined,
  ): Promise<boolean> {
    const channel = await this.prisma.channel.findFirst({
      where: { type: ChannelType.TELEGRAM, isActive: true },
      include: { config: true },
    });

    if (!channel) {
      // No active Telegram channel found — allow through (processor will handle)
      return true;
    }

    const configSecret = channel.config.find(
      (c) => c.key === 'webhook_secret',
    )?.value;

    // If no webhook_secret configured, allow through
    if (!configSecret) {
      return true;
    }

    // Secret is configured — header must match
    return secretHeader === configSecret;
  }

  private async validateWhatsAppVerifyToken(token: string): Promise<boolean> {
    const channels = await this.prisma.channel.findMany({
      where: { type: ChannelType.WHATSAPP, isActive: true },
      include: { config: true },
    });

    for (const channel of channels) {
      const verifyToken = channel.config.find(
        (c) => c.key === 'webhook_verify_token',
      );
      if (verifyToken && verifyToken.value === token) {
        return true;
      }
    }
    return false;
  }

  private async validateTwilioSignature(
    req: Request,
    signature: string,
  ): Promise<boolean> {
    const channels = await this.prisma.channel.findMany({
      where: { type: ChannelType.SMS, isActive: true },
      include: { config: true },
    });

    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const body = req.body as Record<string, string>;
    const sortedParams = Object.keys(body)
      .sort()
      .reduce((acc, key) => acc + key + body[key], '');
    const dataToSign = fullUrl + sortedParams;

    for (const channel of channels) {
      const authToken = channel.config.find((c) => c.key === 'auth_token');
      if (authToken) {
        const expectedSignature = crypto
          .createHmac('sha1', authToken.value)
          .update(dataToSign)
          .digest('base64');
        if (expectedSignature === signature) {
          return true;
        }
      }
    }
    return false;
  }
}
