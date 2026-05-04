import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type ChannelConfigEntry = {
	key: string;
	value: string;
	isSecret?: boolean;
};

export type Channel = {
	id: string;
	type: string;
	name: string;
	isActive: boolean;
	config: ChannelConfigEntry[];
	createdAt: string;
};

export async function listChannels(): Promise<Channel[]> {
	const response = await api.get('/messaging/channels');
	return normalizeListResponse<Channel>(response.data);
}

export async function getChannel(channelId: string): Promise<{ name: string | null }> {
	const response = await api.get<{ channel?: { name: string | null } | null }>(
		`/messaging/channels/${channelId}`,
	);
	return { name: response.data.channel?.name ?? null };
}

export type CreateChannelPayload = {
	type: string;
	name: string;
	config: ChannelConfigEntry[];
};

export async function createChannel(payload: CreateChannelPayload): Promise<Channel> {
	const response = await api.post<Channel>('/messaging/channels', payload);
	return response.data;
}

export type UpdateChannelPayload = Partial<{
	name: string;
	isActive: boolean;
	config: ChannelConfigEntry[];
}>;

export async function updateChannel(
	channelId: string,
	payload: UpdateChannelPayload,
): Promise<void> {
	await api.patch(`/messaging/channels/${channelId}`, payload);
}

export async function deleteChannel(channelId: string, deleteData: boolean): Promise<void> {
	await api.delete(`/messaging/channels/${channelId}`, { params: { deleteData } });
}

export async function testChannel(channelId: string): Promise<{ ok: boolean; message?: string }> {
	const response = await api.post<{ ok: boolean; message?: string }>(
		`/messaging/channels/${channelId}/test`,
	);
	return response.data;
}
