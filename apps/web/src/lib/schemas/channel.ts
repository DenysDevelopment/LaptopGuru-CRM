import { z } from "zod";

export const CHANNEL_TYPES = [
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "TELEGRAM",
  "FACEBOOK_MESSENGER",
  "INSTAGRAM_DIRECT",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

// Channel config entry (key-value with optional secret flag)
const configEntrySchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  isSecret: z.boolean().optional(),
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(1, "Введите название канала").max(100),
  type: z.enum(CHANNEL_TYPES),
  config: z.array(configEntrySchema).optional(),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const updateChannelSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  config: z.array(configEntrySchema).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
