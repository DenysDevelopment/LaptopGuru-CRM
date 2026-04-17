import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, NotFoundException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicLandingGuard } from './public-landing.guard';

function makeCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('PublicLandingGuard', () => {
  let guard: PublicLandingGuard;
  let prisma: {
    raw: {
      landingVisit: { findUnique: ReturnType<typeof vi.fn> };
      videoPlaybackSession: { findUnique: ReturnType<typeof vi.fn> };
    };
  };
  let reflector: Reflector;

  beforeEach(() => {
    prisma = {
      raw: {
        landingVisit: { findUnique: vi.fn() },
        videoPlaybackSession: { findUnique: vi.fn() },
      },
    };
    reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    guard = new PublicLandingGuard(prisma as never, reflector);
  });

  it('accepts valid create-session body and attaches publicContext', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'abc', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const req = { body: { slug: 'abc', visitId: 'v1', videoId: 'vid1' }, params: {} };
    const ok = await guard.canActivate(makeCtx(req));
    expect(ok).toBe(true);
    expect((req as { publicContext?: unknown }).publicContext).toEqual({
      companyId: 'c1',
      landingId: 'l1',
      visitId: 'v1',
      videoId: 'vid1',
    });
  });

  it('rejects when visit is missing', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(makeCtx({ body: { slug: 'x', visitId: 'v', videoId: 'vid' }, params: {} })),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects when slug does not match the visit landing', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'wrong', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    await expect(
      guard.canActivate(makeCtx({ body: { slug: 'abc', visitId: 'v1', videoId: 'vid1' }, params: {} })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when videoId does not match the landing video', async () => {
    prisma.raw.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'abc', companyId: 'c1', videoId: 'OTHER', id: 'l1' },
    });
    await expect(
      guard.canActivate(makeCtx({ body: { slug: 'abc', visitId: 'v1', videoId: 'vid1' }, params: {} })),
    ).rejects.toThrow(BadRequestException);
  });

  it('chunk route: resolves context from sessionId when body lacks ids', async () => {
    prisma.raw.videoPlaybackSession.findUnique.mockResolvedValue({
      id: 's1',
      landingVisitId: 'v1',
      videoId: 'vid1',
      companyId: 'c1',
      visit: { landingId: 'l1' },
    });
    const req = { body: { seq: 1, events: [], final: false }, params: { sessionId: 's1' } };
    const ok = await guard.canActivate(makeCtx(req));
    expect(ok).toBe(true);
    expect((req as { publicContext?: unknown }).publicContext).toEqual({
      companyId: 'c1',
      landingId: 'l1',
      visitId: 'v1',
      videoId: 'vid1',
      sessionId: 's1',
    });
  });
});
