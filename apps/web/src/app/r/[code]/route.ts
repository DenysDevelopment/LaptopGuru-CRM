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
	const appUrl =
		process.env.APP_URL && !process.env.APP_URL.includes('localhost')
			? process.env.APP_URL
			: _request.nextUrl.origin;
	const slug = shortLink.landing.slug.replace(/[^a-zA-Z0-9_-]/g, '');
	return NextResponse.redirect(`${appUrl}/l/${slug}`);
}
