import { z } from 'zod';

export const conversationContactSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	avatarUrl: z.string().nullable(),
});

export const conversationAssigneeSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
});

export const conversationTagSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string(),
});

export const conversationListItemSchema = z.object({
	id: z.string(),
	status: z.string(),
	priority: z.string(),
	channelType: z.string(),
	subject: z.string().nullable(),
	lastMessageAt: z.string().nullable(),
	lastMessagePreview: z.string().nullable(),
	createdAt: z.string(),
	closedAt: z.string().nullable(),
	contact: conversationContactSchema.nullable(),
	assignee: conversationAssigneeSchema.nullable(),
	tags: z.array(conversationTagSchema),
	unreadCount: z.number(),
});

export const conversationListResponseSchema = z.object({
	items: z.array(conversationListItemSchema),
});

export type ConversationListItem = z.infer<typeof conversationListItemSchema>;
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;
