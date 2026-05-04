import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type MessageAttachment = {
	id?: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	storageKey: string;
	storageUrl: string;
};

export type Message = {
	id: string;
	direction: 'INBOUND' | 'OUTBOUND' | string;
	body: string | null;
	contentType: string | null;
	channelType: string;
	status: string | null;
	createdAt: string;
	attachments: MessageAttachment[];
	sender: { id: string; name: string | null } | null;
	metadata?: Record<string, unknown> | null;
};

export async function listMessages(
	conversationId: string,
	params: { page?: number; limit?: number } = {},
): Promise<Message[]> {
	const response = await api.get(
		`/messaging/conversations/${conversationId}/messages`,
		{ params: { limit: 50, ...params } },
	);
	return normalizeListResponse<Message>(response.data);
}

export type SendMessagePayload = {
	body: string;
	contentType?: string;
	attachments?: MessageAttachment[];
};

export type SendMessageResult = {
	id: string;
	externalId: string | null;
	deliveryStatus: string | null;
};

export async function sendMessage(
	conversationId: string,
	payload: SendMessagePayload,
): Promise<SendMessageResult> {
	const response = await api.post<SendMessageResult>(
		`/messaging/conversations/${conversationId}/messages`,
		payload,
	);
	return response.data;
}
