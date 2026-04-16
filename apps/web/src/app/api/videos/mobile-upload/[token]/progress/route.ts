import { NextRequest, NextResponse } from "next/server";
import { validateMobileUploadToken } from "@/lib/mobile-upload-token";
import { emitMobileUploadEvent } from "@/lib/mobile-upload-events";

/**
 * Public: mobile client reports S3 upload progress (0–100). Pure pass-through
 * to the SSE bus — not persisted. Throttled on the client side (roughly every
 * 500 ms) so we don't hammer the DB with validation queries.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const check = await validateMobileUploadToken(token);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 410 });
  }

  const { pct } = await request.json().catch(() => ({}));
  const n = typeof pct === "number" ? Math.max(0, Math.min(100, Math.round(pct))) : null;
  if (n === null) {
    return NextResponse.json({ error: "pct required" }, { status: 400 });
  }

  emitMobileUploadEvent(token, { type: "progress", pct: n });

  return NextResponse.json({ ok: true });
}
