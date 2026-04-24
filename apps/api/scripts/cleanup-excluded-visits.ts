/**
 * One-time cleanup for analytics pollution from admin/test IPs.
 *
 *   1. Optionally seed IPs into every company's excludedIps list.
 *   2. For each company, delete LandingVisit rows whose `ip` is in that list
 *      and recompute the landing.views / landing.clicks counters from the
 *      surviving visits.
 *   3. Same for QuickLinkVisit and quickLink.clicks.
 *
 * Usage:
 *   npx tsx apps/api/scripts/cleanup-excluded-visits.ts            # use existing excludedIps
 *   npx tsx apps/api/scripts/cleanup-excluded-visits.ts 1.2.3.4    # seed extra IP(s) first
 *
 * Re-runnable: operations are idempotent.
 */

import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
	const seedIps = process.argv.slice(2);

	if (seedIps.length > 0) {
		console.log(`[seed] Adding IPs to every company's excludedIps: ${seedIps.join(', ')}`);
		const companies = await prisma.company.findMany({
			select: { id: true, excludedIps: true, name: true },
		});
		for (const c of companies) {
			const merged = Array.from(new Set([...(c.excludedIps ?? []), ...seedIps]));
			if (merged.length === c.excludedIps.length) continue;
			await prisma.company.update({
				where: { id: c.id },
				data: { excludedIps: { set: merged } },
			});
			console.log(`  + ${c.name}: ${c.excludedIps.length} -> ${merged.length}`);
		}
	}

	const companies = await prisma.company.findMany({
		select: { id: true, name: true, excludedIps: true },
	});

	for (const company of companies) {
		const excluded = company.excludedIps;
		if (excluded.length === 0) continue;
		console.log(
			`\n[${company.name}] Processing ${excluded.length} excluded IP(s): ${excluded.join(', ')}`,
		);

		// Landing visits
		const doomed = await prisma.landingVisit.findMany({
			where: { companyId: company.id, ip: { in: excluded } },
			select: { id: true, landingId: true },
		});
		if (doomed.length > 0) {
			const { count } = await prisma.landingVisit.deleteMany({
				where: { companyId: company.id, ip: { in: excluded } },
			});
			console.log(`  deleted ${count} LandingVisit row(s)`);

			const affectedLandingIds = Array.from(
				new Set(doomed.map((v) => v.landingId)),
			);
			for (const landingId of affectedLandingIds) {
				const [views, clicks] = await Promise.all([
					prisma.landingVisit.count({ where: { landingId } }),
					prisma.landingVisit.count({
						where: { landingId, buyButtonClicked: true },
					}),
				]);
				await prisma.landing.update({
					where: { id: landingId },
					data: { views, clicks },
				});
			}
			console.log(
				`  recomputed views/clicks for ${affectedLandingIds.length} landing(s)`,
			);
		} else {
			console.log('  no matching LandingVisit rows');
		}

		// QuickLink visits
		const doomedQl = await prisma.quickLinkVisit.findMany({
			where: { companyId: company.id, ip: { in: excluded } },
			select: { id: true, quickLinkId: true },
		});
		if (doomedQl.length > 0) {
			const { count } = await prisma.quickLinkVisit.deleteMany({
				where: { companyId: company.id, ip: { in: excluded } },
			});
			console.log(`  deleted ${count} QuickLinkVisit row(s)`);

			const affectedQlIds = Array.from(
				new Set(doomedQl.map((v) => v.quickLinkId)),
			);
			for (const qlId of affectedQlIds) {
				const clicks = await prisma.quickLinkVisit.count({
					where: { quickLinkId: qlId },
				});
				await prisma.quickLink.update({
					where: { id: qlId },
					data: { clicks },
				});
			}
			console.log(
				`  recomputed clicks for ${affectedQlIds.length} quickLink(s)`,
			);
		} else {
			console.log('  no matching QuickLinkVisit rows');
		}
	}

	console.log('\nDone.');
}

main()
	.catch((err) => {
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
