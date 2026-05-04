import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type ConversationNote = {
	id: string;
	body: string;
	author: { id: string; name: string | null } | null;
	createdAt: string;
};

export async function listConversationNotes(
	conversationId: string,
): Promise<ConversationNote[]> {
	const response = await api.get(`/messaging/conversations/${conversationId}/notes`);
	return normalizeListResponse<ConversationNote>(response.data);
}

export async function createNote(
	conversationId: string,
	body: string,
): Promise<ConversationNote> {
	const response = await api.post<ConversationNote>('/messaging/notes', {
		conversationId,
		body,
	});
	return response.data;
}
