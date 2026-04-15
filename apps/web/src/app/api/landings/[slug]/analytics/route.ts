import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@laptopguru-crm/shared";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { session, error } = await authorize(PERMISSIONS.ANALYTICS_READ);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 403 });
  }

  const { slug } = await params;

  const landing = await prisma.landing.findFirst({
    where: { slug, companyId },
    include: {
      video: { select: { title: true, thumbnail: true, source: true, durationSeconds: true } },
      incomingEmail: { select: { customerName: true, customerEmail: true } },
      shortLinks: { select: { code: true, clicks: true } },
    },
  });

  if (!landing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Pagination for visits list
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = (page - 1) * limit;

  // Aggregation: load only fields needed for stats (cap at 10k for memory safety)
  const allVisits = await prisma.landingVisit.findMany({
    where: { landingId: landing.id },
    orderBy: { visitedAt: "desc" },
    take: 10_000,
    select: {
      id: true,
      canvasHash: true,
      sessionId: true,
      ip: true,
      buyButtonClicked: true,
      timeOnPage: true,
      maxScrollDepth: true,
      videoPlayed: true,
      videoWatchTime: true,
      videoCompleted: true,
      deviceType: true,
      browser: true,
      os: true,
      country: true,
      city: true,
      referrerDomain: true,
      utmSource: true,
    },
  });

  const totalCount = await prisma.landingVisit.count({ where: { landingId: landing.id } });

  // Aggregated stats
  const totalVisits = totalCount;

  // Unique visitors by fingerprint > sessionId > IP
  // Fallback to v.id when all identifiers are null (genuinely unknown visitor)
  const uniqueKeys = new Set(
    allVisits.map((v) => v.canvasHash || v.sessionId || v.ip || v.id)
  );
  const uniqueVisitors = uniqueKeys.size;

  const buyClicks = allVisits.filter((v) => v.buyButtonClicked).length;
  const conversionRate = totalVisits > 0 ? Math.round((buyClicks / totalVisits) * 100) : 0;

  // Only average over visits that actually have engagement data (timeOnPage > 0)
  const engagedVisits = allVisits.filter((v) => v.timeOnPage && v.timeOnPage > 0);
  const engagedCount = engagedVisits.length;

  const avgTimeOnPage = engagedCount > 0
    ? Math.round(engagedVisits.reduce((s, v) => s + (v.timeOnPage || 0), 0) / engagedCount) : 0;
  const avgScrollDepth = engagedCount > 0
    ? Math.round(engagedVisits.reduce((s, v) => s + (v.maxScrollDepth || 0), 0) / engagedCount) : 0;

  const videoPlays = allVisits.filter((v) => v.videoPlayed).length;
  const videoPlayRate = totalVisits > 0 ? Math.round((videoPlays / totalVisits) * 100) : 0;
  const videoCompleted = allVisits.filter((v) => v.videoCompleted).length;
  const videoWatchers = allVisits.filter((v) => v.videoPlayed && v.videoWatchTime && v.videoWatchTime > 0);
  const avgVideoWatch = videoWatchers.length > 0
    ? Math.round(videoWatchers.reduce((s, v) => s + (v.videoWatchTime || 0), 0) / videoWatchers.length) : 0;

  // Max time on page (longest session)
  const maxTimeOnPage = engagedVisits.length > 0
    ? Math.max(...engagedVisits.map((v) => v.timeOnPage || 0)) : 0;

  // Device breakdown
  const devices: Record<string, number> = {};
  const browsers: Record<string, number> = {};
  const oses: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const referrers: Record<string, number> = {};
  const utmSources: Record<string, number> = {};

  for (const v of allVisits) {
    if (v.deviceType) devices[v.deviceType] = (devices[v.deviceType] || 0) + 1;
    if (v.browser) browsers[v.browser] = (browsers[v.browser] || 0) + 1;
    if (v.os) oses[v.os] = (oses[v.os] || 0) + 1;
    if (v.country) countries[v.country] = (countries[v.country] || 0) + 1;
    if (v.city) cities[`${v.city}, ${v.country}`] = (cities[`${v.city}, ${v.country}`] || 0) + 1;
    if (v.referrerDomain) referrers[v.referrerDomain] = (referrers[v.referrerDomain] || 0) + 1;
    if (v.utmSource) utmSources[v.utmSource] = (utmSources[v.utmSource] || 0) + 1;
  }

  // Sort helper
  const sortObj = (obj: Record<string, number>) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 15);

  return NextResponse.json({
    landing: {
      id: landing.id,
      slug: landing.slug,
      title: landing.title,
      views: landing.views,
      clicks: landing.clicks,
      createdAt: landing.createdAt,
      customerName: landing.incomingEmail?.customerName,
      customerEmail: landing.incomingEmail?.customerEmail,
      videoTitle: landing.video.title,
      videoId: landing.videoId,
      videoSource: landing.video.source,
      videoDurationSeconds: landing.video.durationSeconds,
    },
    summary: {
      totalVisits,
      uniqueVisitors,
      buyClicks,
      conversionRate,
      avgTimeOnPage,
      avgScrollDepth,
      videoPlays,
      videoPlayRate,
      videoCompleted,
      avgVideoWatch,
      maxTimeOnPage,
      engagedCount,
    },
    breakdown: {
      devices: sortObj(devices),
      browsers: sortObj(browsers),
      oses: sortObj(oses),
      countries: sortObj(countries),
      cities: sortObj(cities),
      referrers: sortObj(referrers),
      utmSources: sortObj(utmSources),
    },
    // Paginated visits list (detailed fields loaded separately)
    pagination: { page, limit, totalCount },
    visits: await getVisitsPage(landing.id, offset, limit),
  });
}

async function getVisitsPage(landingId: string, offset: number, limit: number) {
  const visits = await prisma.landingVisit.findMany({
    where: { landingId },
    orderBy: { visitedAt: "desc" },
    skip: offset,
    take: limit,
  });
  return visits.map((v) => ({
    id: v.id,
    visitedAt: v.visitedAt,

    // Network & Geo
    ip: v.ip,
    country: v.country,
    countryCode: v.countryCode,
    city: v.city,
    region: v.region,
    timezone: v.timezone,
    lat: v.lat,
    lon: v.lon,
    isp: v.isp,
    org: v.org,
    asNumber: v.asNumber,

    // Device
    browser: v.browser,
    browserVersion: v.browserVersion,
    os: v.os,
    osVersion: v.osVersion,
    deviceType: v.deviceType,
    screenWidth: v.screenWidth,
    screenHeight: v.screenHeight,
    viewportWidth: v.viewportWidth,
    viewportHeight: v.viewportHeight,
    pixelRatio: v.pixelRatio,
    touchSupport: v.touchSupport,
    maxTouchPoints: v.maxTouchPoints,

    // Hardware
    cpuCores: v.cpuCores,
    deviceMemory: v.deviceMemory,
    gpuRenderer: v.gpuRenderer,
    gpuVendor: v.gpuVendor,

    // Battery
    batteryLevel: v.batteryLevel,
    batteryCharging: v.batteryCharging,

    // Preferences
    darkMode: v.darkMode,
    reducedMotion: v.reducedMotion,
    cookiesEnabled: v.cookiesEnabled,
    doNotTrack: v.doNotTrack,
    adBlocker: v.adBlocker,

    // Connection
    connectionType: v.connectionType,
    downlink: v.downlink,
    rtt: v.rtt,
    saveData: v.saveData,

    // Referrer & UTM
    referrer: v.referrer,
    referrerDomain: v.referrerDomain,
    utmSource: v.utmSource,
    utmMedium: v.utmMedium,
    utmCampaign: v.utmCampaign,
    utmTerm: v.utmTerm,
    utmContent: v.utmContent,

    // Engagement
    timeOnPage: v.timeOnPage,
    maxScrollDepth: v.maxScrollDepth,
    buyButtonClicked: v.buyButtonClicked,
    videoPlayed: v.videoPlayed,
    videoWatchTime: v.videoWatchTime,
    videoCompleted: v.videoCompleted,
    videoTimeToPlay: v.videoTimeToPlay,
    videoBufferCount: v.videoBufferCount,
    videoBufferTime: v.videoBufferTime,
    videoDroppedFrames: v.videoDroppedFrames,
    totalClicks: v.totalClicks,
    tabSwitches: v.tabSwitches,

    // Language
    browserLang: v.browserLang,
    browserLangs: v.browserLangs,

    // Fingerprints
    canvasHash: v.canvasHash,
    webglHash: v.webglHash,

    // Extended data
    extendedData: v.extendedData,
  }));
}
