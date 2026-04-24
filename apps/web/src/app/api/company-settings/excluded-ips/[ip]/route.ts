import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ ip: string }> },
) {
	const session = await auth();
	const u = session?.user as
		| { companyId?: string | null; role?: string }
		| undefined;
	if (!u?.companyId) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN') {
		return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
	}

	const { ip } = await params;
	const target = decodeURIComponent(ip);

	const company = await prisma.company.findUnique({
		where: { id: u.companyId },
		select: { excludedIps: true },
	});
	const filtered = (company?.excludedIps ?? []).filter(x => x !== target);

	const updated = await prisma.company.update({
		where: { id: u.companyId },
		data: { excludedIps: { set: filtered } },
		select: { excludedIps: true },
	});
	return NextResponse.json({ excludedIps: updated.excludedIps });
}
