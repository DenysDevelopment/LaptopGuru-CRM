import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';
import {
	conversationListResponseSchema,
	type ConversationListItem,
} from '@/lib/schemas/conversation';

export type ListConversationsParams = {
	page?: number;
	limit?: number;
	status?: string;
	search?: string;
	assigneeId?: string;
	channelId?: string;
	channelType?: string;
	channelTypes?: string;
	priority?: string;
};

export async function listConversations(
	params: ListConversationsParams = {},
): Promise<ConversationListItem[]> {
	const response = await api.get('/messaging/conversations', { params });
	const parsed = conversationListResponseSchema.parse(response.data);
	return parsed.items;
}

export type ConversationContact = {
	id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	avatarUrl: string | null;
	company: string | null;
	channels: { type: string; externalId: string }[];
};

export type TimelineEvent = {
	id: string;
	type: string;
	actor: { id: string; name: string | null; email: string | null } | null;
	payload: Record<string, unknown> | null;
	createdAt: string;
	landingStats: {
		views: number;
		clicks: number;
		firstVisitAt: string | null;
		videoPlays: number;
		bestCompletionPercent: number | null;
	} | null;
};

export type ConversationDetail = {
	id: string;
	status: string;
	priority: string;
	channelType: string;
	subject: string | null;
	createdAt: string;
	closedAt: string | null;
	lastStatusChangedAt: string | null;
	lastStatusChangedBy: { id: string; name: string | null; email: string } | null;
	contact: ConversationContact | null;
	assignee: { id: string; name: string | null; email: string | null } | null;
	tags: { id: string; name: string; color: string }[];
	events: TimelineEvent[];
};

export async function getConversation(id: string): Promise<ConversationDetail> {
	const response = await api.get<ConversationDetail>(`/messaging/conversations/${id}`);
	return response.data;
}

export async function patchConversation(
	id: string,
	patch: { status?: string; priority?: string },
): Promise<void> {
	await api.patch(`/messaging/conversations/${id}`, patch);
}

export async function markConversationRead(id: string): Promise<void> {
	await api.post(`/messaging/conversations/${id}/read`);
}

export async function setConversationStatus(id: string, status: string): Promise<void> {
	await api.patch(`/messaging/conversations/${id}/status`, { status });
}

export async function assignConversation(id: string, assigneeId: string | null): Promise<void> {
	await api.post(`/messaging/conversations/${id}/assign`, { assigneeId });
}

export async function addConversationTag(conversationId: string, tagId: string): Promise<void> {
	await api.post(`/messaging/conversations/${conversationId}/tags`, { tagId });
}

export async function removeConversationTag(
	conversationId: string,
	tagId: string,
): Promise<void> {
	await api.delete(`/messaging/conversations/${conversationId}/tags`, { data: { tagId } });
}

export type UnreadSummary = { items: { unreadCount: number }[] };

export async function getUnreadSummary(): Promise<UnreadSummary> {
	const response = await api.get('/messaging/conversations', { params: { limit: 50 } });
	const items = normalizeListResponse<{ unreadCount: number }>(response.data);
	return { items };
}
