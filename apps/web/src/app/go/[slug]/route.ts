import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { parseUASimple } from "@/lib/utils/user-agent";
import { geolocateSimple } from "@/lib/utils/geo";
import { extractDomain, extractIP } from "@/lib/utils/headers";

/** Validate that URL uses http(s) and is not a javascript: or data: URL */
function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const link = await prisma.quickLink.findFirst({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Validate redirect URL to prevent open redirect attacks
  if (!isSafeRedirectUrl(link.targetUrl)) {
    return NextResponse.json({ error: "Invalid redirect URL" }, { status: 400 });
  }

  // Determine whether this visit should be excluded from analytics:
  //   - valid admin session for the same company, OR
  //   - caller IP is in the company's excludedIps allowlist
  const ip = extractIP(request);
  let excluded = false;
  try {
    const session = await auth();
    const sessionCompanyId = (session?.user as { companyId?: string } | undefined)?.companyId;
    if (sessionCompanyId && sessionCompanyId === link.companyId) excluded = true;
  } catch { /* treat as anonymous */ }
  if (!excluded && ip) {
    const company = await prisma.company.findUnique({
      where: { id: link.companyId },
      select: { excludedIps: true },
    });
    if (company?.excludedIps.includes(ip)) excluded = true;
  }

  if (!excluded) {
    // Increment click counter
    await prisma.quickLink.update({
      where: { id: link.id },
      data: { clicks: { increment: 1 } },
    });

    // Log visit with analytics
    const ua = request.headers.get("user-agent") || "";
    const ref = request.headers.get("referer") || null;
    const parsed = parseUASimple(ua);

    // Fire and forget — don't block redirect
    (async () => {
      try {
        const { country, city } = ip ? await geolocateSimple(ip) : { country: null, city: null };
        await prisma.quickLinkVisit.create({
          data: {
            quickLinkId: link.id,
            companyId: link.companyId,
            ip, country, city,
            userAgent: ua.slice(0, 500),
            ...parsed,
            referrer: ref?.slice(0, 500) || null,
            referrerDomain: extractDomain(ref),
          },
        });
      } catch (err) {
        console.error("[QuickLink Visit] Analytics error:", err instanceof Error ? err.message : err);
      }
    })();
  }

  return NextResponse.redirect(link.targetUrl);
}
