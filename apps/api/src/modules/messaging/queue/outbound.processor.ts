import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import {
  ChannelType,
  JobStatus,
  MessageDeliveryStatus,
} from '../../../generated/prisma/client';

export interface OutboundJobData {
  outboundJobId: string;
  channelType: ChannelType;
  recipientId: string;
  messageId?: string;
  payload: {
    type: 'text' | 'media';
    text?: string;
    mediaUrl?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
    replyToExternalId?: string;
    metadata?: Record<string, string>;
  };
}

@Processor('outbound-messages')
export class OutboundProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    super();
  }

  async process(job: Job<OutboundJobData>): Promise<void> {
    const { outboundJobId, channelType, recipientId, messageId, payload } =
      job.data;
    const startTime = Date.now();

    this.logger.log(
      `Processing outbound job ${outboundJobId} for ${channelType}`,
    );

    // Mark job as processing
    await this.prisma.outboundJob.update({
      where: { id: outboundJobId },
      data: { status: JobStatus.PROCESSING, startedAt: new Date() },
    });

    try {
      const provider = this.providerRegistry.getOrThrow(channelType);

      let sendResult;
      if (payload.type === 'media' && payload.mediaUrl && payload.mimeType) {
        sendResult = await provider.sendMediaMessage({
          channelType,
          recipientId,
          mediaUrl: payload.mediaUrl,
          mimeType: payload.mimeType,
          fileName: payload.fileName,
          caption: payload.caption,
          replyToExternalId: payload.replyToExternalId,
          metadata: payload.metadata,
        });
      } else {
        sendResult = await provider.sendTextMessage({
          channelType,
          recipientId,
          text: payload.text ?? '',
          replyToExternalId: payload.replyToExternalId,
          metadata: payload.metadata,
        });
      }

      const duration = Date.now() - startTime;

      if (sendResult.success) {
        // Update outbound job
        await this.prisma.outboundJob.update({
          where: { id: outboundJobId },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        // Create success log
        await this.prisma.outboundJobLog.create({
          data: {
            jobId: outboundJobId,
            attempt: job.attemptsMade + 1,
            status: JobStatus.COMPLETED,
            duration,
          },
        });

        // Update message status if message exists
        if (messageId) {
          await this.prisma.message.update({
            where: { id: messageId },
            data: { externalId: sendResult.externalId },
          });

          await this.prisma.messageStatusEvent.create({
            data: {
              messageId,
              status: sendResult.deliveryStatus,
            },
          });
        }

        this.logger.log(
          `Outbound job ${outboundJobId} completed successfully in ${duration}ms`,
        );
      } else {
        throw new Error(sendResult.error ?? 'Send failed with no error message');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Outbound job ${outboundJobId} failed: ${errorMessage}`,
      );

      // Log the failed attempt
      await this.prisma.outboundJobLog.create({
        data: {
          jobId: outboundJobId,
          attempt: job.attemptsMade + 1,
          status: JobStatus.FAILED,
          error: errorMessage,
          duration,
        },
      });

      // Check if we should retry
      const outboundJob = await this.prisma.outboundJob.findUnique({
        where: { id: outboundJobId },
      });

      const attempts = (outboundJob?.attempts ?? 0) + 1;
      const maxAttempts = outboundJob?.maxAttempts ?? 3;

      if (attempts >= maxAttempts) {
        // Final failure
        await this.prisma.outboundJob.update({
          where: { id: outboundJobId },
          data: {
            status: JobStatus.FAILED,
            attempts,
            lastError: errorMessage,
            completedAt: new Date(),
          },
        });

        if (messageId) {
          await this.prisma.messageStatusEvent.create({
            data: {
              messageId,
              status: MessageDeliveryStatus.FAILED,
              error: errorMessage,
            },
          });
        }
      } else {
        // Mark for retry
        await this.prisma.outboundJob.update({
          where: { id: outboundJobId },
          data: {
            status: JobStatus.RETRYING,
            attempts,
            lastError: errorMessage,
          },
        });

        throw error; // Re-throw so BullMQ retries
      }
    }
  }
}
