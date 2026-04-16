import { NextResponse } from "next/server";
import { validateMobileUploadToken } from "@/lib/mobile-upload-token";

/**
 * Public GET: metadata for the mobile page.
 * Returns only title + status — nothing sensitive (companyId etc. never leaves the server).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const check = await validateMobileUploadToken(token);

  if (!check.ok) {
    const status = check.reason === "not_found" ? 404 : 410;
    return NextResponse.json({ error: check.reason }, { status });
  }

  return NextResponse.json({
    title: check.token.title,
    expiresAt: check.token.expiresAt.toISOString(),
  });
}
