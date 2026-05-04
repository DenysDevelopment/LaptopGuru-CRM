import type { NextConfig } from "next";
import path from "path";

const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  output: "standalone",
  // Hide the floating "N" Dev Tools indicator (only visible in `next dev`).
  devIndicators: false,
  // React Compiler is incompatible with react-hook-form's watch/Controller pattern.
  // Disable it to avoid stale onChange handlers breaking form inputs.
  reactCompiler: false,
  // Keep router cache warm so flipping between sidebar pages doesn't
  // re-render / re-fetch the previous one. Default in Next 15 is 0s for
  // dynamic routes — this restores the older "instant back/forward" feel.
  // 5 min for static, 30s for dynamic — long enough for normal navigation,
  // short enough that data isn't stale for hours.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  transpilePackages: ["@laptopguru-crm/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  images: {
    remotePatterns: [
      { hostname: "img.youtube.com" },
      { hostname: "i.ytimg.com" },
      { hostname: "d2e1etvd6vwgr0.cloudfront.net" },
    ],
  },
  // NOTE: public endpoints are proxied at runtime via
  // apps/web/src/app/api/public/[...path]/route.ts — Next.js rewrites() are
  // evaluated at build time, so env vars set only at runtime (INTERNAL_API_URL
  // in docker-compose) never reach the built manifest.
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
          : []),
      ],
    },
    {
      // Mobile-upload page needs camera access. Overrides the blanket
      // Permissions-Policy above — this route is token-gated and short-lived.
      source: "/m/:token*",
      headers: [
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self)" },
      ],
    },
  ],
};

export default nextConfig;
