import { NextRequest } from "next/server";

export function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function extractHeaders(req: NextRequest) {
  const h = (name: string) => req.headers.get(name)?.slice(0, 500) || null;
  return {
    acceptLang: h("accept-language"),
    acceptEncoding: h("accept-encoding"),
    dnt: h("dnt") === "1" ? true : h("dnt") === "0" ? false : null,
    secChUa: h("sec-ch-ua"),
    secChMobile: h("sec-ch-ua-mobile"),
    secChPlatform: h("sec-ch-ua-platform"),
    secFetchSite: h("sec-fetch-site"),
    secFetchMode: h("sec-fetch-mode"),
    secFetchDest: h("sec-fetch-dest"),
    xForwardedProto: h("x-forwarded-proto"),
    via: h("via"),
  };
}

export function extractIP(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    null
  );
}
