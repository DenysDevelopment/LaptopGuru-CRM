import { Module } from '@nestjs/common';
import { ProvidersModule } from './providers/providers.module';
import { ChannelsModule } from './channels/channels.module';
import { ContactsModule } from './contacts/contacts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { TagsModule } from './tags/tags.module';
import { NotesModule } from './notes/notes.module';
import { TemplatesModule } from './templates/templates.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';
import { TeamsModule } from './teams/teams.module';
import { BusinessHoursModule } from './business-hours/business-hours.module';
import { MessagingAnalyticsModule } from './analytics/messaging-analytics.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SyncModule } from './sync/sync.module';
import { AllegroPollCron } from './jobs/allegro-poll.cron';

@Module({
  imports: [
    ProvidersModule,
    ChannelsModule,
    ContactsModule,
    ConversationsModule,
    MessagesModule,
    TagsModule,
    NotesModule,
    TemplatesModule,
    QuickRepliesModule,
    TeamsModule,
    BusinessHoursModule,
    MessagingAnalyticsModule,
    WebhooksModule,
    QueueModule,
    NotificationsModule,
    SyncModule,
  ],
  providers: [AllegroPollCron],
})
export class MessagingModule {}
