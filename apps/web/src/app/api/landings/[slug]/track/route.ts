import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseUA } from "@/lib/utils/user-agent";
import { geolocate } from "@/lib/utils/geo";
import { extractDomain, extractHeaders, extractIP } from "@/lib/utils/headers";
import { resolveCompanyFromRequest } from "@/lib/domain";

// In-memory rate limiter for visit creation (single-instance; upgrade to Redis if scaling horizontally)
const visitRateMap = new Map<string, { count: number; resetAt: number }>();
const MAX_VISITS_PER_IP = 10;
const VISIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = visitRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    visitRateMap.set(ip, { count: 1, resetAt: now + VISIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_VISITS_PER_IP;
}

// CREATE — initial visit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const companyId = await resolveCompanyFromRequest(request);
  const landing = await prisma.landing.findFirst({ where: { slug, ...(companyId ? { companyId } : {}) }, select: { id: true, companyId: true } });
  if (!landing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  const ua = request.headers.get("user-agent") || "";
  const ip = extractIP(request);
  const refHeader = request.headers.get("referer") || body.referrer || null;

  // Rate limit by IP
  if (isRateLimited(ip || "unknown")) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = parseUA(ua);
  const geo = ip ? await geolocate(ip) : { country: null, countryCode: null, city: null, region: null, timezone: null, lat: null, lon: null, isp: null, org: null, asNumber: null };
  const headers = extractHeaders(request);

  const visit = await prisma.landingVisit.create({
    data: {
      landingId: landing.id,
      companyId: landing.companyId,
      sessionId: body.sessionId || crypto.randomUUID(),

      // Network & Geo
      ip,
      ...geo,

      // Server headers
      userAgent: ua.slice(0, 500),
      ...headers,

      // Parsed UA
      ...parsed,

      // Screen & device (from client)
      screenWidth: body.screenWidth ?? null,
      screenHeight: body.screenHeight ?? null,
      viewportWidth: body.viewportWidth ?? null,
      viewportHeight: body.viewportHeight ?? null,
      pixelRatio: body.pixelRatio ?? null,
      touchSupport: body.touchSupport ?? null,
      maxTouchPoints: body.maxTouchPoints ?? null,

      // Hardware
      cpuCores: body.cpuCores ?? null,
      deviceMemory: body.deviceMemory ?? null,
      gpuRenderer: body.gpuRenderer?.slice(0, 200) ?? null,
      gpuVendor: body.gpuVendor?.slice(0, 200) ?? null,

      // Battery
      batteryLevel: body.batteryLevel ?? null,
      batteryCharging: body.batteryCharging ?? null,

      // Preferences
      darkMode: body.darkMode ?? null,
      reducedMotion: body.reducedMotion ?? null,
      cookiesEnabled: body.cookiesEnabled ?? null,
      doNotTrack: body.doNotTrack ?? null,
      adBlocker: body.adBlocker ?? null,
      pdfSupport: body.pdfSupport ?? null,

      // Storage & performance
      storageQuota: body.storageQuota ?? null,
      downlink: body.downlink ?? null,
      rtt: body.rtt ?? null,
      saveData: body.saveData ?? null,

      // Referrer & UTM
      referrer: refHeader?.slice(0, 500) || null,
      referrerDomain: extractDomain(refHeader),
      utmSource: body.utmSource || null,
      utmMedium: body.utmMedium || null,
      utmCampaign: body.utmCampaign || null,
      utmTerm: body.utmTerm || null,
      utmContent: body.utmContent || null,

      // Language
      browserLang: body.browserLang || null,
      browserLangs: body.browserLangs || null,
      platform: body.platform || null,
      vendor: body.vendor || null,
      connectionType: body.connectionType || null,

      // Fingerprints
      canvasHash: body.canvasHash || null,
      webglHash: body.webglHash || null,
      audioHash: body.audioHash || null,

      // Extended data (JSON blob with all exotic fingerprinting)
      extendedData: body.extendedData || null,
    },
  });

  return NextResponse.json({ visitId: visit.id });
}

// PATCH — update engagement data
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const body = await request.json().catch(() => ({}));
  const { visitId, ...updates } = body;

  if (!visitId) return NextResponse.json({ error: "visitId required" }, { status: 400 });

  // Verify that the visit belongs to the landing identified by slug
  const visit = await prisma.landingVisit.findUnique({
    where: { id: visitId },
    include: { landing: { select: { slug: true } } },
  });
  if (!visit || visit.landing.slug !== slug) {
    return NextResponse.json({ error: "Invalid visit" }, { status: 404 });
  }

  const allowedFields = [
    "timeOnPage", "maxScrollDepth", "buyButtonClicked",
    "videoPlayed", "videoWatchTime", "videoCompleted",
    "videoTimeToPlay", "videoBufferCount", "videoBufferTime", "videoDroppedFrames",
    "pageVisible", "tabSwitches", "totalClicks",
  ];

  const safeData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) safeData[key] = updates[key];
  }

  if (Object.keys(safeData).length === 0) return NextResponse.json({ ok: true });

  await prisma.landingVisit.update({ where: { id: visitId }, data: safeData });
  return NextResponse.json({ ok: true });
}
