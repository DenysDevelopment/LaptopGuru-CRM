import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = {
	name: string;
	label: string;
	ok: boolean;
	skipped?: boolean;
	message: string;
	hint?: string;
};

async function checkDns(
	domain: string,
	expectedTarget: string,
): Promise<Check> {
	try {
		const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
		if (cnames.length > 0) {
			const target = cnames[0].replace(/\.$/, "").toLowerCase();
			const expected = expectedTarget.toLowerCase();
			if (target === expected) {
				return {
					name: "dns",
					label: "DNS",
					ok: true,
					message: `CNAME корректно указывает на ${expected}`,
				};
			}
			return {
				name: "dns",
				label: "DNS",
				ok: false,
				message: `CNAME указывает на ${target}, ожидается ${expected}`,
				hint: `Исправьте CNAME в панели DNS вашего домена`,
			};
		}
		const aRecords = await dns.resolve4(domain).catch(() => [] as string[]);
		if (aRecords.length > 0) {
			return {
				name: "dns",
				label: "DNS",
				ok: false,
				message: `Найдены A-записи (${aRecords.join(", ")}) вместо CNAME`,
				hint: `Удалите A-запись и добавьте CNAME на ${expectedTarget}`,
			};
		}
		return {
			name: "dns",
			label: "DNS",
			ok: false,
			message: "DNS-запись не найдена",
			hint: "Добавьте CNAME и подождите 5–30 минут для обновления DNS",
		};
	} catch (err) {
		return {
			name: "dns",
			label: "DNS",
			ok: false,
			message: `Ошибка: ${(err as Error).message}`,
		};
	}
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			redirect: "manual",
			signal: controller.signal,
			headers: { "User-Agent": "LaptopGuru-CRM-DomainCheck/1.0" },
		});
	} finally {
		clearTimeout(timer);
	}
}

async function checkHttp(domain: string): Promise<Check> {
	try {
		const res = await fetchWithTimeout(`http://${domain}/`, 5000);
		const ok = res.status >= 200 && res.status < 400;
		const via = res.headers.get("server") ?? "";
		const isCaddy = via.toLowerCase().includes("caddy");
		return {
			name: "http",
			label: "HTTP",
			ok,
			message: ok
				? `Сервер отвечает: ${res.status}${isCaddy ? " (Caddy)" : ""}`
				: `Неожиданный статус: ${res.status}`,
			hint: !isCaddy && ok
				? "Запрос идёт не через Caddy — возможно домен смотрит не на наш сервер"
				: undefined,
		};
	} catch (err) {
		return {
			name: "http",
			label: "HTTP",
			ok: false,
			message: `Сервер не отвечает: ${(err as Error).message}`,
			hint: "Проверьте, что DNS обновился и указывает на наш сервер",
		};
	}
}

async function checkHttps(domain: string): Promise<Check> {
	try {
		const res = await fetchWithTimeout(`https://${domain}/`, 10000);
		// Receiving ANY HTTP response means TLS handshake succeeded — the cert
		// is valid. 404 on `/` is expected because the custom-domain middleware
		// only serves /{slug} and /{code}; it returns 404 on root by design
		// (see apps/web/src/middleware.ts). Flag only 5xx as a real problem.
		const ok = res.status < 500;
		return {
			name: "https",
			label: "SSL / HTTPS",
			ok,
			message: ok
				? `SSL сертификат валиден (HTTPS ${res.status})`
				: `HTTPS вернул ${res.status}`,
		};
	} catch (err) {
		const msg = (err as Error).message;
		const sslError =
			msg.includes("SSL") ||
			msg.includes("certificate") ||
			msg.includes("TLS") ||
			msg.includes("self-signed") ||
			msg.includes("UNABLE_TO_VERIFY") ||
			msg.includes("internal error");
		return {
			name: "https",
			label: "SSL / HTTPS",
			ok: false,
			message: sslError
				? "SSL сертификат ещё не выпущен"
				: `HTTPS недоступен: ${msg}`,
			hint: sslError
				? "Caddy выпускает сертификат Let's Encrypt при первом запросе. Подождите 1–2 минуты и повторите."
				: undefined,
		};
	}
}

export async function GET() {
	const session = await auth();
	if (!session?.user)
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { companyId } = session.user as unknown as {
		companyId: string | null;
	};
	if (!companyId)
		return NextResponse.json({ error: "No company" }, { status: 400 });

	const company = await prisma.company.findUnique({
		where: { id: companyId },
		select: { id: true, customDomain: true, isActive: true },
	});

	if (!company?.customDomain) {
		return NextResponse.json({ domain: null, checks: [] });
	}

	const domain = company.customDomain;
	const expectedTarget = process.env.DOMAIN ?? "crm.laptopguru.link";

	const database: Check = {
		name: "database",
		label: "База данных",
		ok: company.isActive,
		message: company.isActive
			? "Домен сохранён и компания активна"
			: "Компания неактивна — свяжитесь с администратором",
	};

	const dnsCheck = await checkDns(domain, expectedTarget);

	let http: Check;
	let https: Check;
	if (!dnsCheck.ok) {
		http = {
			name: "http",
			label: "HTTP",
			ok: false,
			skipped: true,
			message: "Пропущено — сначала настройте DNS",
		};
		https = {
			name: "https",
			label: "SSL / HTTPS",
			ok: false,
			skipped: true,
			message: "Пропущено — сначала настройте DNS",
		};
	} else {
		http = await checkHttp(domain);
		if (!http.ok) {
			https = {
				name: "https",
				label: "SSL / HTTPS",
				ok: false,
				skipped: true,
				message: "Пропущено — HTTP недоступен",
			};
		} else {
			https = await checkHttps(domain);
		}
	}

	const checks: Check[] = [database, dnsCheck, http, https];
	const allOk = checks.every((c) => c.ok);

	return NextResponse.json({ domain, expectedTarget, allOk, checks });
}
