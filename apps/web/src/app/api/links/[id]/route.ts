import { NextResponse } from "next/server";
import { authorize } from "@/lib/authorize";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { PERMISSIONS } from "@laptopguru-crm/shared";

/**
 * DELETE /api/links/:id — admin-only hard-delete of a landing.
 *
 * Cascades via Prisma:
 *   - LandingVisit → Cascade (and VideoPlaybackSession via visit)
 *   - ShortLink    → Cascade
 * SentEmail has no cascade (history preserved by default), so we delete those
 * rows explicitly inside a transaction before dropping the landing itself.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await authorize(PERMISSIONS.LINKS_DELETE);
  if (error) return error;

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company" }, { status: 403 });
  }

  const { id } = await params;

  // Confirm ownership before touching anything.
  const landing = await prisma.landing.findUnique({
    where: { id },
    select: { id: true, companyId: true, slug: true, title: true, views: true, clicks: true },
  });
  if (!landing || landing.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction([
      prisma.sentEmail.deleteMany({ where: { landingId: id } }),
      prisma.landing.delete({ where: { id } }),
    ]);
    await writeAudit({
      userId: session.user.id,
      companyId,
      action: "DELETE",
      entity: "Landing",
      entityId: id,
      payload: { slug: landing.slug, title: landing.title, views: landing.views, clicks: landing.clicks },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
