import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { parseUA } from '../../common/utils/user-agent';
import { geolocate } from '../../common/utils/geo';
import { extractDomain, extractHeaders, extractIP } from '../../common/utils/headers';

// Simple in-memory rate limiter for click tracking
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

@Injectable()
export class LandingsService {
  private readonly logger = new Logger(LandingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // POST /landings/:slug/click
  async trackClick(slug: string, req: Request) {
    if (!slug || slug.length > 100) {
      throw new BadRequestException('Invalid slug');
    }

    const forwarded = req.headers['x-forwarded-for'];
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const ip =
      forwardedStr?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      'unknown';

    if (isRateLimited(ip)) {
      return { error: 'Too many requests', statusCode: 429 };
    }

    const result = await this.prisma.landing.updateMany({
      where: { slug },
      data: { clicks: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new NotFoundException('Not found');
    }

    return { ok: true };
  }

  // POST /landings/:slug/track
  async createVisit(slug: string, body: Record<string, any>, req: Request) {
    // Accept optional companySlug in body to narrow the search
    const companySlug = body.companySlug as string | undefined;
    let landing: { id: string; companyId: string } | null = null;

    if (companySlug) {
      const company = await this.prisma.raw.company.findUnique({
        where: { slug: companySlug },
        select: { id: true },
      });
      if (company) {
        landing = await this.prisma.raw.landing.findFirst({
          where: { slug, companyId: company.id },
          select: { id: true, companyId: true },
        });
      }
    } else {
      landing = await this.prisma.raw.landing.findFirst({
        where: { slug },
        select: { id: true, companyId: true },
      });
    }

    if (!landing) {
      throw new NotFoundException('Not found');
    }

    const ua = (req.headers['user-agent'] as string) || '';
    const ip = extractIP(req);
    const refHeader =
      (req.headers['referer'] as string) || body.referrer || null;
    const parsed = parseUA(ua);
    const geo = ip
      ? await geolocate(ip)
      : {
          country: null,
          countryCode: null,
          city: null,
          region: null,
          timezone: null,
          lat: null,
          lon: null,
          isp: null,
          org: null,
          asNumber: null,
        };
    const headers = extractHeaders(req);

    const visit = await this.prisma.raw.landingVisit.create({
      data: {
        landingId: landing.id,
        companyId: landing.companyId,
        sessionId: body.sessionId || randomUUID(),

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

        // Extended data
        extendedData: body.extendedData || null,
      },
    });

    return { visitId: visit.id };
  }

  // PATCH /landings/:slug/track
  async updateEngagement(body: Record<string, any>) {
    const { visitId, ...updates } = body;

    if (!visitId) {
      throw new BadRequestException('visitId required');
    }

    const allowedFields = [
      'timeOnPage',
      'maxScrollDepth',
      'buyButtonClicked',
      'videoPlayed',
      'videoWatchTime',
      'videoCompleted',
      'pageVisible',
      'tabSwitches',
      'totalClicks',
    ];

    const safeData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) safeData[key] = updates[key];
    }

    if (Object.keys(safeData).length === 0) return { ok: true };

    // Verify visit exists before updating (public endpoint, no auth)
    const existing = await this.prisma.raw.landingVisit.findUnique({
      where: { id: visitId },
      select: { id: true },
    });
    if (!existing) {
      throw new BadRequestException('Invalid visitId');
    }

    await this.prisma.raw.landingVisit.update({
      where: { id: visitId },
      data: safeData,
    });
    return { ok: true };
  }

  // GET /landings/:slug/analytics
  async getAnalytics(slug: string) {
    const landing = await this.prisma.landing.findFirst({
      where: { slug },
      include: {
        video: { select: { title: true, thumbnail: true } },
        incomingEmail: {
          select: { customerName: true, customerEmail: true },
        },
        shortLinks: { select: { code: true, clicks: true } },
      },
    });

    if (!landing) {
      throw new NotFoundException('Not found');
    }

    const visits = await this.prisma.landingVisit.findMany({
      where: { landingId: landing.id },
      orderBy: { visitedAt: 'desc' },
    });

    // Aggregated stats
    const totalVisits = visits.length;

    // Unique visitors by fingerprint > sessionId > IP
    const uniqueKeys = new Set(
      visits.map((v) => v.canvasHash || v.sessionId || v.ip || v.id),
    );
    const uniqueVisitors = uniqueKeys.size;

    const buyClicks = visits.filter((v) => v.buyButtonClicked).length;
    const conversionRate =
      totalVisits > 0 ? Math.round((buyClicks / totalVisits) * 100) : 0;

    const engagedVisits = visits.filter(
      (v) => v.timeOnPage && v.timeOnPage > 0,
    );
    const engagedCount = engagedVisits.length;

    const avgTimeOnPage =
      engagedCount > 0
        ? Math.round(
            engagedVisits.reduce((s, v) => s + (v.timeOnPage || 0), 0) /
              engagedCount,
          )
        : 0;
    const avgScrollDepth =
      engagedCount > 0
        ? Math.round(
            engagedVisits.reduce((s, v) => s + (v.maxScrollDepth || 0), 0) /
              engagedCount,
          )
        : 0;

    const videoPlays = visits.filter((v) => v.videoPlayed).length;
    const videoPlayRate =
      totalVisits > 0 ? Math.round((videoPlays / totalVisits) * 100) : 0;
    const videoWatchers = visits.filter(
      (v) => v.videoPlayed && v.videoWatchTime && v.videoWatchTime > 0,
    );
    const avgVideoWatch =
      videoWatchers.length > 0
        ? Math.round(
            videoWatchers.reduce((s, v) => s + (v.videoWatchTime || 0), 0) /
              videoWatchers.length,
          )
        : 0;

    const maxTimeOnPage =
      engagedVisits.length > 0
        ? Math.max(...engagedVisits.map((v) => v.timeOnPage || 0))
        : 0;

    // Breakdowns
    const devices: Record<string, number> = {};
    const browsers: Record<string, number> = {};
    const oses: Record<string, number> = {};
    const countries: Record<string, number> = {};
    const cities: Record<string, number> = {};
    const referrers: Record<string, number> = {};
    const utmSources: Record<string, number> = {};

    for (const v of visits) {
      if (v.deviceType)
        devices[v.deviceType] = (devices[v.deviceType] || 0) + 1;
      if (v.browser) browsers[v.browser] = (browsers[v.browser] || 0) + 1;
      if (v.os) oses[v.os] = (oses[v.os] || 0) + 1;
      if (v.country)
        countries[v.country] = (countries[v.country] || 0) + 1;
      if (v.city)
        cities[`${v.city}, ${v.country}`] =
          (cities[`${v.city}, ${v.country}`] || 0) + 1;
      if (v.referrerDomain)
        referrers[v.referrerDomain] =
          (referrers[v.referrerDomain] || 0) + 1;
      if (v.utmSource)
        utmSources[v.utmSource] = (utmSources[v.utmSource] || 0) + 1;
    }

    const sortObj = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    return {
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
    };
  }
}
