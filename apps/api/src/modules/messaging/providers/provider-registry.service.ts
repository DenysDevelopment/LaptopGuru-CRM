import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '../../../generated/prisma/client';
import { ChannelProvider } from './provider.interface';

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly providers = new Map<ChannelType, ChannelProvider>();

  register(provider: ChannelProvider): void {
    if (this.providers.has(provider.channelType)) {
      this.logger.warn(
        `Overwriting existing provider for channel type: ${provider.channelType}`,
      );
    }
    this.providers.set(provider.channelType, provider);
    this.logger.log(`Registered provider for channel type: ${provider.channelType}`);
  }

  get(channelType: ChannelType): ChannelProvider | undefined {
    return this.providers.get(channelType);
  }

  getOrThrow(channelType: ChannelType): ChannelProvider {
    const provider = this.providers.get(channelType);
    if (!provider) {
      throw new Error(`No provider registered for channel type: ${channelType}`);
    }
    return provider;
  }

  has(channelType: ChannelType): boolean {
    return this.providers.has(channelType);
  }

  getAll(): Map<ChannelType, ChannelProvider> {
    return new Map(this.providers);
  }

  getRegisteredTypes(): ChannelType[] {
    return Array.from(this.providers.keys());
  }
}
