import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ProviderRegistryService } from './provider-registry.service';
import { EmailProviderService } from './email/email-provider.service';
import { TelegramProviderService } from './telegram/telegram-provider.service';
import { WhatsAppProviderService } from './whatsapp/whatsapp-provider.service';
import { SmsProviderService } from './sms/sms-provider.service';
import { AllegroOAuthService } from './allegro/allegro-oauth.service';
import { AllegroProviderService } from './allegro/allegro-provider.service';

@Global()
@Module({
  providers: [
    ProviderRegistryService,
    EmailProviderService,
    TelegramProviderService,
    WhatsAppProviderService,
    SmsProviderService,
    AllegroOAuthService,
    AllegroProviderService,
  ],
  exports: [
    ProviderRegistryService,
    EmailProviderService,
    TelegramProviderService,
    WhatsAppProviderService,
    SmsProviderService,
    AllegroOAuthService,
    AllegroProviderService,
  ],
})
export class ProvidersModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistryService,
    private readonly emailProvider: EmailProviderService,
    private readonly telegramProvider: TelegramProviderService,
    private readonly whatsappProvider: WhatsAppProviderService,
    private readonly smsProvider: SmsProviderService,
    private readonly allegroProvider: AllegroProviderService,
  ) {}

  onModuleInit() {
    this.registry.register(this.emailProvider);
    this.registry.register(this.telegramProvider);
    this.registry.register(this.whatsappProvider);
    this.registry.register(this.smsProvider);
    this.registry.register(this.allegroProvider);
  }
}
