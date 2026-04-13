import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextRequest, NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/** Paths that should pass through unchanged on custom domains */
const PASSTHROUGH_PREFIXES = ["/api/", "/r/", "/_next/", "/favicon"];

function isPassthrough(pathname: string): boolean {
	return PASSTHROUGH_PREFIXES.some((p) => pathname.startsWith(p));
}

function handleCustomDomain(request: NextRequest, host: string): NextResponse {
	const { pathname } = request.nextUrl;

	// /r/, /api/, /_next/ — pass through as-is
	if (isPassthrough(pathname)) {
		const response = NextResponse.next();
		response.headers.set("x-custom-domain", host);
		return response;
	}

	// Root path — no landing to show
	if (pathname === "/") {
		return new NextResponse("Not Found", { status: 404 });
	}

	// Everything else: /slug → rewrite to /l/slug
	const url = request.nextUrl.clone();
	url.pathname = `/l${pathname}`;
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
