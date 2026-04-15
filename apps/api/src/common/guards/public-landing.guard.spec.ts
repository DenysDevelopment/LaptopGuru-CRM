import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException, ExecutionContext } from '@nestjs/common';
import { PublicLandingGuard } from './public-landing.guard';

function mockCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PublicLandingGuard', () => {
  const prisma = {
    landingVisit: {
      findUnique: vi.fn(),
    },
  };
  const guard = new PublicLandingGuard(prisma as never);

  beforeEach(() => {
    prisma.landingVisit.findUnique.mockReset();
  });

  it('rejects when slug is missing', async () => {
    const ctx = mockCtx({ params: {}, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when visit does not exist', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue(null);
    const ctx = mockCtx({ params: { slug: 's' }, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when slug does not match landing', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'other', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const ctx = mockCtx({ params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when body.videoId does not match landing.videoId', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'mine', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const ctx = mockCtx({ params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'BAD' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('populates req.publicContext on success', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'mine', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const req: any = { params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'vid1' } };
    const ctx = mockCtx(req);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.publicContext).toEqual({
      companyId: 'c1',
      landingId: 'l1',
      visitId: 'v1',
      videoId: 'vid1',
    });
  });

  it('also resolves visitId from params when body lacks it (chunks endpoint)', async () => {
    prisma.landingVisit.findUnique.mockResolvedValue({
      id: 'v1',
      landing: { slug: 'mine', companyId: 'c1', videoId: 'vid1', id: 'l1' },
    });
    const ctx = mockCtx({ params: { slug: 'mine' }, body: { visitId: 'v1', videoId: 'vid1' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
