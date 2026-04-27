import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ConversationStatusService } from './status.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationStatusService],
  exports: [ConversationsService, ConversationStatusService],
})
export class ConversationsModule {}
