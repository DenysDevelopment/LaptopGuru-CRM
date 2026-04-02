import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@shorterlink/shared";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { error } = await authorize(PERMISSIONS.ANALYTICS_READ);
  if (error) return error;

  const { slug } = await params;

  const landing = await prisma.landing.findFirst({
    where: { slug },
    include: {
      video: { select: { title: true, thumbnail: true } },
      incomingEmail: { select: { customerName: true, customerEmail: true } },
      shortLinks: { select: { code: true, clicks: true } },
    },
  });

  if (!landing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visits = await prisma.landingVisit.findMany({
    where: { landingId: landing.id },
    orderBy: { visitedAt: "desc" },
  });

  // Aggregated stats
  const totalVisits = visits.length;

  // Unique visitors by fingerprint > sessionId > IP
  const uniqueKeys = new Set(
    visits.map((v) => v.canvasHash || v.sessionId || v.ip || v.id)
  );
  const uniqueVisitors = uniqueKeys.size;

  const buyClicks = visits.filter((v) => v.buyButtonClicked).length;
  const conversionRate = totalVisits > 0 ? Math.round((buyClicks / totalVisits) * 100) : 0;

  // Only average over visits that actually have engagement data (timeOnPage > 0)
  const engagedVisits = visits.filter((v) => v.timeOnPage && v.timeOnPage > 0);
  const engagedCount = engagedVisits.length;

  const avgTimeOnPage = engagedCount > 0
    ? Math.round(engagedVisits.reduce((s, v) => s + (v.timeOnPage || 0), 0) / engagedCount) : 0;
  const avgScrollDepth = engagedCount > 0
    ? Math.round(engagedVisits.reduce((s, v) => s + (v.maxScrollDepth || 0), 0) / engagedCount) : 0;

  const videoPlays = visits.filter((v) => v.videoPlayed).length;
  const videoPlayRate = totalVisits > 0 ? Math.round((videoPlays / totalVisits) * 100) : 0;
  const videoWatchers = visits.filter((v) => v.videoPlayed && v.videoWatchTime && v.videoWatchTime > 0);
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

  for (const v of visits) {
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
    visits: visits.map((v) => ({
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
    })),
  });
}
