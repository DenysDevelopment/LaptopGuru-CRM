import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderRegistryService } from '../providers/provider-registry.service';
import { CreateChannelDto, ChannelConfigItemDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly cls: ClsService,
  ) {}

  async findAll() {
    const channels = await this.prisma.channel.findMany({
      include: { config: { select: { id: true, key: true, value: true, isSecret: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return channels.map((ch) => ({
      ...ch,
      config: ch.config.map((c) => ({
        ...c,
        value: c.isSecret ? '••••••••' : c.value,
      })),
    }));
  }

  async findOne(id: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
      include: {
        config: { select: { id: true, key: true, value: true, isSecret: true } },
      },
    });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);

    return {
      ...channel,
      config: channel.config.map((c) => ({
        ...c,
        value: c.isSecret ? '••••••••' : c.value,
      })),
    };
  }

  async create(dto: CreateChannelDto) {
    // Check for duplicate EMAIL channel by username
    if (dto.type === 'EMAIL' && dto.config?.length) {
      const username = dto.config.find((c) => c.key === 'username')?.value;
      if (username) {
        const allEmailChannels = await this.prisma.channel.findMany({
          where: { type: 'EMAIL' },
          include: { config: true },
        });
        for (const ch of allEmailChannels) {
          const chUsername = ch.config.find((c) => c.key === 'username')?.value;
          if (chUsername === username) {
            throw new ConflictException(
              `Channel with username ${username} already exists`,
            );
          }
        }
      }
    }

    // Check duplicate by name + type
    const existingByName = await this.prisma.channel.findFirst({
      where: { name: dto.name, type: dto.type },
    });
    if (existingByName) {
      throw new ConflictException(
        `Channel "${dto.name}" of this type already exists`,
      );
    }

    const companyId = this.cls.get<string>('companyId');
    const channel = await this.prisma.channel.create({
      data: {
        name: dto.name,
        type: dto.type,
        isActive: dto.isActive ?? true,
        companyId,
        config: dto.config?.length
          ? {
              create: dto.config.map((c) => ({
                key: c.key,
                value: c.value,
                isSecret: c.isSecret ?? false,
              })),
            }
          : undefined,
      },
      include: {
        config: { select: { id: true, key: true, value: true, isSecret: true } },
      },
    });

    // Auto-register Telegram webhook
    if (dto.type === 'TELEGRAM') {
      const botToken = dto.config?.find((c) => c.key === 'bot_token')?.value;
      if (botToken) {
        const appUrl = process.env.APP_URL || '';
        const webhookUrl = `${appUrl}/api/messaging/webhooks/telegram`;
        const webhookSecret = randomUUID().replace(/-/g, '');
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${botToken}/setWebhook`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: webhookUrl,
                secret_token: webhookSecret,
              }),
            },
          );
          const result = await res.json();
          if (!result.ok) {
            this.logger.error(
              `[Telegram] setWebhook failed: ${result.description}`,
            );
          }

          // Save webhook URL and secret to config
          await this.prisma.channelConfig.createMany({
            data: [
              { channelId: channel.id, key: 'webhook_url', value: webhookUrl },
              {
                channelId: channel.id,
                key: 'webhook_secret',
                value: webhookSecret,
                isSecret: true,
              },
            ],
          });
        } catch (err) {
          this.logger.error('[Telegram] Failed to set webhook', err);
        }
      }
    }

    return channel;
  }

  async update(id: string, dto: UpdateChannelDto) {
    await this.ensureExists(id);

    const channel = await this.prisma.channel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        config: { select: { id: true, key: true, value: true, isSecret: true } },
      },
    });

    return {
      ...channel,
      config: channel.config.map((c) => ({
        ...c,
        value: c.isSecret ? '••••••••' : c.value,
      })),
    };
  }

  async remove(id: string, deleteData = false) {
    const channel = await this.ensureExists(id);

    if (deleteData) {
      // Delete channel WITH all messages and conversations
      return this.prisma.$transaction([
        this.prisma.message.deleteMany({ where: { channelId: id } }),
        this.prisma.conversation.deleteMany({ where: { channelId: id } }),
        this.prisma.template.updateMany({ where: { channelId: id }, data: { channelId: null } }),
        this.prisma.channelConfig.deleteMany({ where: { channelId: id } }),
        this.prisma.incomingEmail.updateMany({ where: { channelId: id }, data: { channelId: null } }),
        this.prisma.channel.delete({ where: { id } }),
      ]);
    }

    // Soft-delete: deactivate channel, keep messages/conversations
    await this.prisma.$transaction([
      this.prisma.template.updateMany({ where: { channelId: id }, data: { channelId: null } }),
      this.prisma.channelConfig.deleteMany({ where: { channelId: id } }),
      this.prisma.incomingEmail.updateMany({ where: { channelId: id }, data: { channelId: null } }),
    ]);
    return this.prisma.channel.update({
      where: { id },
      data: { isActive: false, name: `[Удалён] ${channel.name}` },
    });
  }

  async upsertConfig(channelId: string, items: ChannelConfigItemDto[]) {
    await this.ensureExists(channelId);

    const results = await Promise.all(
      items.map((item) =>
        this.prisma.channelConfig.upsert({
          where: { channelId_key: { channelId, key: item.key } },
          update: {
            value: item.value,
            isSecret: item.isSecret ?? false,
          },
          create: {
            channelId,
            key: item.key,
            value: item.value,
            isSecret: item.isSecret ?? false,
          },
        }),
      ),
    );

    return results;
  }

  async testConnection(channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { config: true },
    });
    if (!channel) throw new NotFoundException(`Channel ${channelId} not found`);

    const provider = this.providerRegistry.get(channel.type);
    if (!provider) {
      return { success: false, error: `No provider registered for ${channel.type}` };
    }

    const configMap = new Map(channel.config.map((c) => [c.key, c.value]));

    try {
      const valid = await provider.testConnection(configMap);
      return { success: valid, error: valid ? undefined : 'Connection test failed' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async ensureExists(id: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException(`Channel ${id} not found`);
    return channel;
  }
}
