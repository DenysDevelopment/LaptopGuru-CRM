import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { WebSseBridgeService } from './web-sse-bridge.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        return { secret };
      },
    }),
  ],
  providers: [NotificationsGateway, NotificationsService, WebSseBridgeService],
  exports: [NotificationsService, NotificationsGateway, WebSseBridgeService],
})
export class NotificationsModule {}
