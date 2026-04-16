import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextRequest, NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/** Paths that should pass through unchanged on custom domains */
const PASSTHROUGH_PREFIXES = ["/api/", "/r/", "/go/", "/_next/", "/favicon"];

function isPassthrough(pathname: string): boolean {
	return PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Short link codes are exactly 6 alphanumeric chars (see apps/api/src/common/utils/links.ts) */
const SHORT_CODE_RE = /^\/[0-9a-zA-Z]{6}$/;

function handleCustomDomain(request: NextRequest, host: string): NextResponse {
	const { pathname } = request.nextUrl;

	// /r/, /api/, /_next/ — pass through as-is
	if (isPassthrough(pathname)) {
		const response = NextResponse.next();
		response.headers.set("x-custom-domain", host);
		return response;
	}

	// Root path — nothing to serve on the custom domain itself. Redirect to
	// the parent domain (e.g. l.laptopguru.pl → laptopguru.pl) so the user
	// lands on the brand's main site instead of a 404. Falls back to 404
	// only when the custom domain is already at the apex (no subdomain).
	if (pathname === "/") {
		const parts = host.split(".");
		if (parts.length > 2) {
			const parent = parts.slice(1).join(".");
			return NextResponse.redirect(`https://${parent}/`, 308);
		}
		return new NextResponse("Not Found", { status: 404 });
	}

	const url = request.nextUrl.clone();

	// /XXXXXX (6 alphanumeric chars) → rewrite to /r/XXXXXX (short link redirect)
	if (SHORT_CODE_RE.test(pathname)) {
		url.pathname = `/r${pathname}`;
	} else {
		// Everything else: /slug → rewrite to /l/slug
		url.pathname = `/l${pathname}`;
	}

	const response = NextResponse.rewrite(url);
	response.headers.set("x-custom-domain", host);
	return response;
}

export default async function middleware(request: NextRequest) {
	const host = request.headers.get("host")?.split(":")[0] ?? "";
	const crmDomain = process.env.DOMAIN ?? "";

	// Only treat as custom domain when DOMAIN env is explicitly set and host differs
	const isCustomDomain = crmDomain !== "" && host !== crmDomain && host !== "localhost";

	if (isCustomDomain) {
		return handleCustomDomain(request, host);
	}

	// CRM domain: run NextAuth authorization as before
	return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(request);
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization)
		 * - favicon.ico, sitemap.xml, robots.txt
		 * - public assets (images, etc.)
		 */
		"/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
	],
};
