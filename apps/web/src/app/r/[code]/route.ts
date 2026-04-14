import { prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ code: string }> },
) {
	const { code } = await params;

	if (!code || code.length > 50) {
		return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
	}

	const shortLink = await prisma.shortLink.findUnique({
		where: { code },
		include: { landing: true },
	});

	if (!shortLink) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	// Increment click counter
	await prisma.shortLink.update({
		where: { id: shortLink.id },
		data: { clicks: { increment: 1 } },
	});

	// Only redirect to internal landing pages — slug is alphanumeric
	const slug = shortLink.landing.slug.replace(/[^a-zA-Z0-9_-]/g, '');

	const hostHeader = _request.headers.get('host') ?? '';
	const host = hostHeader.split(':')[0];
	const crmDomain = process.env.DOMAIN ?? 'localhost';
	const isCustomDomain = host !== '' && host !== crmDomain && host !== 'localhost';

	const proto = _request.headers.get('x-forwarded-proto') ?? 'https';
	const publicOrigin = hostHeader ? `${proto}://${hostHeader}` : '';

	if (isCustomDomain) {
		// Custom domain: clean URL without /l/ prefix
		return NextResponse.redirect(`${publicOrigin}/${slug}`);
	}

	// CRM domain: existing /l/ prefix
	const appUrl =
		process.env.APP_URL && !process.env.APP_URL.includes('localhost')
			? process.env.APP_URL
			: publicOrigin || _request.nextUrl.origin;
	return NextResponse.redirect(`${appUrl}/l/${slug}`);
}
