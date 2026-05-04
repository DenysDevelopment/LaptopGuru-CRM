import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type QuickReply = {
	id: string;
	shortcut: string;
	title: string;
	body: string;
	createdAt: string;
};

export type QuickReplyPayload = {
	shortcut: string;
	title: string;
	body: string;
};

export async function listQuickReplies(): Promise<QuickReply[]> {
	const response = await api.get('/messaging/quick-replies');
	return normalizeListResponse<QuickReply>(response.data);
}

export async function createQuickReply(payload: QuickReplyPayload): Promise<QuickReply> {
	const response = await api.post<QuickReply>('/messaging/quick-replies', payload);
	return response.data;
}

export async function updateQuickReply(
	id: string,
	payload: QuickReplyPayload,
): Promise<QuickReply> {
	const response = await api.patch<QuickReply>(`/messaging/quick-replies/${id}`, payload);
	return response.data;
}

export async function deleteQuickReply(id: string): Promise<void> {
	await api.delete(`/messaging/quick-replies/${id}`);
}
