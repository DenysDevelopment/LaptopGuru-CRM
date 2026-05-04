import { api } from '@/lib/api';
import { normalizeListResponse } from '@/lib/utils/normalize-response';

export type AnalyticsRange = {
	from?: string;
	to?: string;
};

export type AnalyticsOverview = {
	totalConversations: number;
	totalMessages: number;
	avgResponseTime: number | null;
	openConversations: number;
	closedConversations: number;
	newContacts: number;
};

export type AnalyticsByChannel = {
	channelType: string;
	conversations: number;
	messages: number;
	avgResponseTime: number | null;
};

export async function getAnalyticsOverview(
	range: AnalyticsRange = {},
): Promise<AnalyticsOverview> {
	const response = await api.get<AnalyticsOverview>('/messaging/analytics/overview', {
		params: range,
	});
	return response.data;
}

export async function getAnalyticsByChannel(
	range: AnalyticsRange = {},
): Promise<AnalyticsByChannel[]> {
	const response = await api.get('/messaging/analytics/by-channel', { params: range });
	return normalizeListResponse<AnalyticsByChannel>(response.data);
}
