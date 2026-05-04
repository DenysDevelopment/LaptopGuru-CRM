import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { verifyPhotoToken } from '@/lib/messaging/photo-token';
import { sendViaAllegroDirect } from '@/lib/messaging/allegro-send';
import { emitMessagingEvent } from '@/lib/messaging-events';
import { formatSmtpFrom } from '@/lib/smtp';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads', 'messaging');
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * POST /api/messaging/photo-upload/:token
 *
 * Public endpoint authenticated *only* by the HMAC token in the URL — used by
 * the agent's phone after scanning the QR code. The token binds to a single
 * conversation + agent + company, so we don't need a session here.
 *
 * Saves the photo to disk, creates a Message + MessageAttachment, dispatches
 * to the channel adapter (Allegro/Telegram/Email) so the customer receives
 * it immediately, then emits SSE so the agent's desktop sees the new message.
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	const check = verifyPhotoToken(token);
	if (!check.ok) {
		const status = check.reason === 'expired' ? 410 : 401;
		return NextResponse.json({ error: check.reason }, { status });
	}
	const { cid: conversationId, uid: userId, coid: companyId } = check.payload;

	const conversation = await prisma.conversation.findUnique({
		where: { id: conversationId },
		include: {
			contact: { include: { channels: true } },
			channel: { include: { config: true } },
		},
	});
	if (!conversation || conversation.companyId !== companyId) {
		return NextResponse.json({ error: 'conversation_gone' }, { status: 404 });
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return NextResponse.json({ error: 'expected_multipart' }, { status: 400 });
	}
	const file = formData.get('file');
	if (!file || !(file instanceof Blob)) {
		return NextResponse.json({ error: 'missing_file' }, { status: 400 });
	}
	if (file.size === 0) {
		return NextResponse.json({ error: 'empty_file' }, { status: 400 });
	}
	if (file.size > MAX_SIZE) {
		return NextResponse.json({ error: 'too_large' }, { status: 413 });
	}

	const originalName =
		(file as Blob & { name?: string }).name ?? `photo-${Date.now()}.jpg`;
	const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
	const dirKey = `${conversation.channelId}/${conversationId}`;
	const dirAbs = path.join(UPLOADS_DIR, dirKey);
	await mkdir(dirAbs, { recursive: true });
	const uniquePrefix = crypto.randomBytes(6).toString('hex');
	const finalName = `${uniquePrefix}-${safeName}`;
	const filePathAbs = path.join(dirAbs, finalName);
	const buffer = Buffer.from(await file.arrayBuffer());
	await writeFile(filePathAbs, buffer);

	const storageKey = `uploads/messaging/${dirKey}/${finalName}`;
	const storageUrl = `/${storageKey}`;
	const mimeType = file.type || 'image/jpeg';

	// Persist the outbound Message + attachment up front so the desktop sees
	// it even if external delivery fails.
	const message = await prisma.message.create({
		data: {
			conversationId,
			channelId: conversation.channelId,
			direction: 'OUTBOUND',
			contentType: 'IMAGE',
			body: '',
			senderId: userId,
			contactId: conversation.contactId,
			companyId,
			attachments: {
				create: [
					{
						fileName: originalName,
						mimeType,
						fileSize: buffer.length,
						storageKey,
						storageUrl,
					},
				],
			},
		},
		include: { attachments: true },
	});

	// Dispatch to channel adapter
	let deliveryStatus: 'SENT' | 'FAILED' = 'FAILED';
	let externalId: string | undefined;
	let deliveryError: string | undefined;
	const channelType = conversation.channel?.type;

	try {
		if (channelType === 'ALLEGRO') {
			if (!conversation.externalId) {
				deliveryError = 'Allegro thread id missing';
			} else {
				// Allegro requires non-empty text on /messages — single space works.
				const result = await sendViaAllegroDirect({
					companyId,
					threadId: conversation.externalId,
					text: ' ',
					attachments: [
						{ fileName: originalName, mimeType, storageKey },
					],
				});
				if (result.ok) {
					deliveryStatus = 'SENT';
					externalId = result.messageId;
				} else {
					deliveryError = result.error;
				}
			}
		} else if (channelType === 'TELEGRAM') {
			const cfgMap = Object.fromEntries(
				conversation.channel!.config.map((c) => [c.key, c.value]),
			);
			const botToken = cfgMap.bot_token;
			const contactChan = conversation.contact?.channels.find(
				(c) => c.channelType === 'TELEGRAM',
			);
			if (botToken && contactChan) {
				const appUrl = process.env.APP_URL || 'http://localhost:3000';
				const tgRes = await fetch(
					`https://api.telegram.org/bot${botToken}/sendPhoto`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							chat_id: contactChan.identifier,
							photo: `${appUrl}${storageUrl}`,
						}),
					},
				);
				const tgJson = (await tgRes.json()) as {
					ok: boolean;
					result?: { message_id: number };
				};
				if (tgJson.ok && tgJson.result) {
					deliveryStatus = 'SENT';
					externalId = String(tgJson.result.message_id);
				} else {
					deliveryError = 'Telegram sendPhoto failed';
				}
			} else {
				deliveryError = 'Telegram channel not configured';
			}
		} else if (channelType === 'EMAIL') {
			const cfgMap = Object.fromEntries(
				conversation.channel!.config.map((c) => [c.key, c.value]),
			);
			const emailChan = conversation.contact?.channels.find(
				(c) => c.channelType === 'EMAIL',
			);
			if (emailChan) {
				const nodemailer = await import('nodemailer');
				const port = Number(cfgMap.smtp_port || '465');
				const transporter = nodemailer.default.createTransport({
					host: cfgMap.smtp_host,
					port,
					secure: port === 465,
					auth: { user: cfgMap.smtp_user, pass: cfgMap.smtp_password },
				});
				const info = await transporter.sendMail({
					from: formatSmtpFrom(
						cfgMap.smtp_display_name,
						cfgMap.smtp_from || cfgMap.smtp_user || '',
					),
					to: emailChan.identifier,
					subject: conversation.subject
						? `Re: ${conversation.subject}`
						: 'Фото',
					text: '',
					attachments: [
						{ filename: originalName, path: filePathAbs, contentType: mimeType },
					],
					...(conversation.externalId
						? {
								inReplyTo: conversation.externalId,
								references: conversation.externalId,
							}
						: {}),
				});
				transporter.close();
				deliveryStatus = 'SENT';
				externalId = info.messageId;
			} else {
				deliveryError = 'Contact has no email';
			}
		} else {
			deliveryError = `Channel ${channelType} not supported for photo`;
		}
	} catch (err) {
		deliveryError = err instanceof Error ? err.message : 'delivery failed';
		console.error('[photo-upload] dispatch error:', err);
	}

	await prisma.message.update({
		where: { id: message.id },
		data: { externalId },
	});
	await prisma.messageStatusEvent.create({
		data: { messageId: message.id, status: deliveryStatus },
	});
	await prisma.conversation.update({
		where: { id: conversationId },
		data: { lastMessageAt: new Date() },
	});

	emitMessagingEvent({
		type: 'new_message',
		conversationId,
		message: {
			id: message.id,
			conversationId,
			direction: 'OUTBOUND',
			contentType: 'IMAGE',
			body: '',
			createdAt: message.createdAt.toISOString(),
			sender: { id: userId, name: null },
			status: deliveryStatus,
			attachments: message.attachments.map((a) => ({
				id: a.id,
				fileName: a.fileName,
				mimeType: a.mimeType,
				url: a.storageUrl,
				size: a.fileSize,
			})),
		},
		conversationPatch: {
			lastMessageAt: new Date().toISOString(),
			lastMessagePreview: '📷 Фото',
		},
	});

	if (deliveryStatus === 'FAILED') {
		return NextResponse.json(
			{ ok: false, error: deliveryError || 'delivery_failed', messageId: message.id },
			{ status: 502 },
		);
	}

	return NextResponse.json({
		ok: true,
		messageId: message.id,
		storageUrl,
	});
}
