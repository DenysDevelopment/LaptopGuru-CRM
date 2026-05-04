import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type ContactChannel = {
	type: string;
	externalId: string;
};

export type ContactListItem = {
	id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	avatarUrl: string | null;
	company: string | null;
	channels: ContactChannel[];
	conversationCount: number;
	createdAt: string;
};

export type ListContactsParams = {
	page?: number;
	limit?: number;
	search?: string;
};

export async function listContacts(
	params: ListContactsParams = {},
): Promise<ContactListItem[]> {
	const response = await api.get('/messaging/contacts', {
		params: { limit: 25, ...params },
	});
	return normalizeListResponse<ContactListItem>(response.data);
}

export type ContactConversation = {
	id: string;
	status: string;
	channelType: string;
	createdAt: string;
	lastMessageAt: string | null;
	lastMessagePreview: string | null;
};

export type ContactDetail = Omit<ContactListItem, 'conversationCount'> & {
	customFields: Record<string, string>;
	conversations: ContactConversation[];
};

export async function getContact(id: string): Promise<ContactDetail> {
	const response = await api.get<ContactDetail>(`/messaging/contacts/${id}`);
	return response.data;
}
