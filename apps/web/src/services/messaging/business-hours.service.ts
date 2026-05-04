import { api } from '@/lib/api';
import type { BusinessHoursInput } from '@/lib/schemas/business-hours';

export type BusinessHoursRecord = {
	id: string;
	timezone: BusinessHoursInput['timezone'];
	schedule: BusinessHoursInput['schedule'];
};

export async function getBusinessHours(): Promise<BusinessHoursRecord | null> {
	const response = await api.get('/messaging/business-hours');
	const data = response.data;
	if (!data) return null;
	const item = Array.isArray(data) ? data[0] : data;
	return item ?? null;
}

export async function createBusinessHours(
	payload: BusinessHoursInput,
): Promise<BusinessHoursRecord> {
	const response = await api.post<BusinessHoursRecord>('/messaging/business-hours', payload);
	return response.data;
}

export async function updateBusinessHours(
	id: string,
	payload: BusinessHoursInput,
): Promise<BusinessHoursRecord> {
	const response = await api.patch<BusinessHoursRecord>(
		`/messaging/business-hours/${id}`,
		payload,
	);
	return response.data;
}
