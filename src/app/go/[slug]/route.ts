import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseUASimple } from "@/lib/utils/user-agent";
import { geolocateSimple } from "@/lib/utils/geo";
import { extractDomain, extractIP } from "@/lib/utils/headers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const link = await prisma.quickLink.findUnique({ where: { slug } });
  if (!link) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Increment click counter
  await prisma.quickLink.update({
    where: { id: link.id },
    data: { clicks: { increment: 1 } },
  });

  // Log visit with analytics
  const ua = request.headers.get("user-agent") || "";
  const ip = extractIP(request);
  const ref = request.headers.get("referer") || null;
  const parsed = parseUASimple(ua);

  // Fire and forget — don't block redirect
  (async () => {
    const { country, city } = ip ? await geolocateSimple(ip) : { country: null, city: null };
    await prisma.quickLinkVisit.create({
      data: {
        quickLinkId: link.id,
        ip, country, city,
        userAgent: ua.slice(0, 500),
        ...parsed,
        referrer: ref?.slice(0, 500) || null,
        referrerDomain: extractDomain(ref),
      },
    });
  })().catch(() => {});

  return NextResponse.redirect(link.targetUrl);
}
