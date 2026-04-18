import { NextRequest, NextResponse } from "next/server";

/**
 * Catch-all proxy to the NestJS API at INTERNAL_API_URL. Used for the
 * public video-sessions ingestion endpoints (see apps/api's VideoSessionsModule).
 * Runtime proxy — NOT Next.js rewrites — because rewrites() bakes its
 * destination at build time, when INTERNAL_API_URL is not yet set.
 */
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

async function proxy(req: NextRequest, pathParts: string[]): Promise<NextResponse> {
  const url = `${API_BASE}/api/public/${pathParts.join("/")}${req.nextUrl.search}`;
  const method = req.method;

  // Forward relevant headers; drop host/accept-encoding so upstream serves
  // an unmodified body (saves a decode step and avoids compression mismatches).
  const headers = new Headers();
  for (const [key, value] of req.headers) {
    const k = key.toLowerCase();
    if (k === "host" || k === "connection" || k === "accept-encoding") continue;
    headers.set(key, value);
  }

  const init: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const upstream = await fetch(url, init);
  const resHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    const kk = k.toLowerCase();
    if (kk === "content-encoding" || kk === "transfer-encoding") return;
    resHeaders.set(k, v);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function OPTIONS(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
