import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { VideosModule } from './modules/videos/videos.module';
import { EmailsModule } from './modules/emails/emails.module';
import { LinksModule } from './modules/links/links.module';
import { SendModule } from './modules/send/send.module';
import { SentModule } from './modules/sent/sent.module';
import { QuickLinksModule } from './modules/quicklinks/quicklinks.module';
import { LandingsModule } from './modules/landings/landings.module';
import { StatsModule } from './modules/stats/stats.module';
import { AdminModule } from './modules/admin/admin.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { CompanyGuard } from './common/guards/company.guard';
import Redis from 'ioredis';
import { RateLimitService, REDIS_CLIENT } from './common/services/rate-limit.service';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    MessagingModule,
    VideosModule,
    EmailsModule,
    LinksModule,
    SendModule,
    SentModule,
    QuickLinksModule,
    LandingsModule,
    StatsModule,
    AdminModule,
    SuperAdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CompanyGuard },
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(process.env.REDIS_URL || 'redis://localhost:6379'),
    },
    RateLimitService,
  ],
  exports: [RateLimitService],
})
export class AppModule {}
