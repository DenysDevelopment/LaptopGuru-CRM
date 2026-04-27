import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboundProcessor } from './outbound.processor';
import { InboundProcessor } from './inbound.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'outbound-messages' },
      { name: 'inbound-messages' },
    ),
    NotificationsModule,
    ConversationsModule,
  ],
  providers: [OutboundProcessor, InboundProcessor],
  exports: [BullModule],
})
export class QueueModule {}
