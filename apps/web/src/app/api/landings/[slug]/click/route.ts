import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveCompanyFromRequest } from "@/lib/domain";

// In-memory rate limiter for click tracking (single-instance; resets on deploy; upgrade to Redis if scaling horizontally)
const clickRateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_CLICKS_PER_IP = 30;
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = clickRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    clickRateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_CLICKS_PER_IP;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || slug.length > 100) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  // Rate limit by IP to prevent click inflation
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const companyId = await resolveCompanyFromRequest(request);
  const result = await prisma.landing.updateMany({
    where: { slug, ...(companyId ? { companyId } : {}) },
    data: { clicks: { increment: 1 } },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
